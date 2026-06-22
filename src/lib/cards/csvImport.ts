"use client";

import type { ScryCard } from "@/types";
import {
  collectionEntryId,
  getRepo,
  type CardFinish,
  type CollectionCard,
} from "@/lib/repo";
import { cacheCards } from "@/lib/db";

/**
 * CSV collection import (Mana Flood / Archidekt / Moxfield style). Resolves
 * each printing by its Scryfall ID via /api/cards/by-ids (batched 75, server
 * throttled to 2 req/s). Rows without a Scryfall ID are reported unresolved.
 */

// ---------------------------------------------------------------------------
// RFC-4180-ish CSV parser (handles quoted fields, embedded commas/newlines)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\r") {
      i++;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  // last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

interface ColumnMap {
  quantity: number;
  name: number;
  scryfallId: number;
  finish: number;
  setName: number;
  setCode: number;
  collectorNumber: number;
}

function findCol(headers: string[], candidates: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const idx = norm.indexOf(c.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

export function mapColumns(headers: string[]): ColumnMap {
  return {
    quantity: findCol(headers, ["quantity", "count", "qty", "card count"]),
    name: findCol(headers, ["card name", "name", "card"]),
    scryfallId: findCol(headers, ["scryfall id", "scryfallid", "scryfall_id", "scryfall", "id"]),
    finish: findCol(headers, ["foil/variant", "foil", "finish", "printing", "variant", "foiling"]),
    setName: findCol(headers, ["edition name", "edition", "set name", "set", "expansion"]),
    setCode: findCol(headers, ["set code", "edition code", "setcode", "set_code"]),
    collectorNumber: findCol(headers, [
      "collector number",
      "collector_number",
      "card number",
      "number",
      "cn",
      "collector",
    ]),
  };
}

function parseFinish(raw: string | undefined): CardFinish {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || v === "normal" || v === "nonfoil" || v === "non-foil" || v === "no" || v === "false")
    return "nonfoil";
  if (v.includes("etched")) return "etched";
  if (v.includes("foil") || v === "yes" || v === "true" || v === "1") return "foil";
  return "nonfoil";
}

export interface ParsedCsvRow {
  /** Present when the export includes a Scryfall id (most precise). */
  scryfallId?: string;
  name: string;
  quantity: number;
  finish: CardFinish;
  setName?: string;
  setCode?: string;
  collectorNumber?: string;
}

export interface CsvParseResult {
  rows: ParsedCsvRow[];
  /** Rows with no usable identifier (no id and no name). */
  skipped: { name: string; reason: string }[];
  totalRows: number;
}

export function parseCollectionCsv(text: string): CsvParseResult {
  const grid = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (grid.length === 0) return { rows: [], skipped: [], totalRows: 0 };
  const headers = grid[0]!;
  const cols = mapColumns(headers);
  const rows: ParsedCsvRow[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r]!;
    const get = (idx: number) => (idx >= 0 ? (cells[idx] ?? "").trim() : "");
    const name = get(cols.name);
    const scryfallId = get(cols.scryfallId);
    const quantity = parseInt(get(cols.quantity) || "1", 10) || 1;
    // A row is usable if it has a Scryfall id OR a name (to resolve by).
    if (!scryfallId && !name) {
      skipped.push({ name: "(unnamed)", reason: "no Scryfall ID or card name" });
      continue;
    }
    rows.push({
      scryfallId: scryfallId || undefined,
      name: name || "(unnamed)",
      quantity,
      finish: parseFinish(get(cols.finish)),
      setName: get(cols.setName) || undefined,
      setCode: get(cols.setCode) || undefined,
      collectorNumber: get(cols.collectorNumber) || undefined,
    });
  }
  return { rows, skipped, totalRows: grid.length - 1 };
}

// ---------------------------------------------------------------------------
// Resolve + build
// ---------------------------------------------------------------------------

export interface ImportProgress {
  phase: "resolve" | "save" | "done";
  resolved: number;
  total: number;
}

export interface ImportResult {
  added: number;
  cards: number;
  unresolvedIds: number;
  skippedRows: number;
}

type Identifier =
  | { id: string }
  | { name: string }
  | { set: string; collector_number: string }
  | { name: string; set: string };

/** Best Scryfall identifier for a row: id → set+collector → name+set → name. */
function rowIdentifier(row: ParsedCsvRow): Identifier {
  if (row.scryfallId) return { id: row.scryfallId };
  if (row.setCode && row.collectorNumber)
    return { set: row.setCode.toLowerCase(), collector_number: row.collectorNumber };
  if (row.setCode && row.name !== "(unnamed)") return { name: row.name, set: row.setCode.toLowerCase() };
  return { name: row.name };
}

async function resolveIdentifierBatch(batch: Identifier[]): Promise<ScryCard[]> {
  const res = await fetch("/api/cards/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifiers: batch }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { cards: ScryCard[] };
  return data.cards;
}

/**
 * Resolve the parsed rows and write them to the collection. Resolves by
 * Scryfall id, set+collector number, name+set, or name — so exports from many
 * apps work, not just those with a Scryfall ID column.
 * `mode: "replace"` clears the existing collection first.
 */
export async function importCollection(
  parsed: CsvParseResult,
  mode: "merge" | "replace",
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const repo = getRepo();

  // Dedupe identifiers across rows so we resolve each printing once.
  const idents = new Map<string, Identifier>();
  for (const row of parsed.rows) idents.set(JSON.stringify(rowIdentifier(row)), rowIdentifier(row));
  const uniqueIdents = [...idents.values()];

  const resolvedCards: ScryCard[] = [];
  const BATCH = 75;
  for (let i = 0; i < uniqueIdents.length; i += BATCH) {
    resolvedCards.push(...(await resolveIdentifierBatch(uniqueIdents.slice(i, i + BATCH))));
    onProgress?.({
      phase: "resolve",
      resolved: Math.min(i + BATCH, uniqueIdents.length),
      total: uniqueIdents.length,
    });
  }

  // Cache resolved printings, and index them for row → card matching.
  await cacheCards(resolvedCards).catch(() => {});
  const byId = new Map<string, ScryCard>();
  const bySetCn = new Map<string, ScryCard>();
  const byName = new Map<string, ScryCard>();
  for (const c of resolvedCards) {
    byId.set(c.id, c);
    if (c.set && c.collector_number) bySetCn.set(`${c.set}:${c.collector_number}`, c);
    if (!byName.has(c.name.toLowerCase())) byName.set(c.name.toLowerCase(), c);
  }
  const matchRow = (row: ParsedCsvRow): ScryCard | undefined => {
    if (row.scryfallId && byId.has(row.scryfallId)) return byId.get(row.scryfallId);
    if (row.setCode && row.collectorNumber) {
      const hit = bySetCn.get(`${row.setCode.toLowerCase()}:${row.collectorNumber}`);
      if (hit) return hit;
    }
    return byName.get(row.name.toLowerCase());
  };

  // Build entries, merging duplicate (printing + finish) rows by summing qty.
  const entries = new Map<string, CollectionCard>();
  let unresolvedIds = 0;
  const now = Date.now();
  for (const row of parsed.rows) {
    const card = matchRow(row);
    if (!card) {
      unresolvedIds += 1;
      continue;
    }
    const id = collectionEntryId(card.id, row.finish);
    const existing = entries.get(id);
    if (existing) {
      existing.quantity += row.quantity;
    } else {
      entries.set(id, {
        id,
        printingId: card.id,
        oracleId: card.oracle_id,
        name: card.name,
        setCode: card.set ?? row.setCode,
        setName: card.set_name ?? row.setName,
        collectorNumber: card.collector_number ?? row.collectorNumber,
        finish: row.finish,
        quantity: row.quantity,
        card,
        addedAt: now,
        updatedAt: now,
      });
    }
  }

  onProgress?.({ phase: "save", resolved: uniqueIdents.length, total: uniqueIdents.length });

  const list = [...entries.values()];
  if (mode === "replace") {
    await repo.clearCollection();
    await repo.saveCollectionEntries(list);
  } else {
    // Merge: add imported quantities on top of any existing stacks.
    const existing = new Map((await repo.listCollection()).map((c) => [c.id, c]));
    for (const e of list) {
      const prev = existing.get(e.id);
      if (prev) e.quantity += prev.quantity;
    }
    await repo.saveCollectionEntries(list);
  }

  onProgress?.({ phase: "done", resolved: uniqueIdents.length, total: uniqueIdents.length });
  return {
    added: list.length,
    cards: list.reduce((n, e) => n + e.quantity, 0),
    unresolvedIds,
    skippedRows: parsed.skipped.length,
  };
}
