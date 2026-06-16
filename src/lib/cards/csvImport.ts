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
    quantity: findCol(headers, ["quantity", "count", "qty"]),
    name: findCol(headers, ["card name", "name"]),
    scryfallId: findCol(headers, ["scryfall id", "scryfallid", "scryfall_id", "id"]),
    finish: findCol(headers, ["foil/variant", "foil", "finish", "printing", "variant"]),
    setName: findCol(headers, ["edition name", "edition", "set name", "set"]),
    setCode: findCol(headers, ["set code", "edition code", "setcode"]),
    collectorNumber: findCol(headers, ["collector number", "collector_number", "card number", "number"]),
  };
}

function parseFinish(raw: string | undefined): CardFinish {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || v === "normal" || v === "nonfoil" || v === "non-foil") return "nonfoil";
  if (v.includes("etched")) return "etched";
  if (v.includes("foil")) return "foil";
  return "nonfoil";
}

export interface ParsedCsvRow {
  scryfallId: string;
  name: string;
  quantity: number;
  finish: CardFinish;
  setName?: string;
  setCode?: string;
  collectorNumber?: string;
}

export interface CsvParseResult {
  rows: ParsedCsvRow[];
  /** Rows lacking a Scryfall ID (can't be resolved reliably). */
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
    const name = get(cols.name) || "(unnamed)";
    const scryfallId = get(cols.scryfallId);
    const quantity = parseInt(get(cols.quantity) || "1", 10) || 1;
    if (!scryfallId) {
      skipped.push({ name, reason: "no Scryfall ID" });
      continue;
    }
    rows.push({
      scryfallId,
      name,
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

async function resolveByIds(ids: string[]): Promise<Map<string, ScryCard>> {
  const res = await fetch("/api/cards/by-ids", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) return new Map();
  const data = (await res.json()) as { cards: ScryCard[] };
  return new Map(data.cards.map((c) => [c.id, c]));
}

/**
 * Resolve the parsed rows and write them to the collection.
 * `mode: "replace"` clears the existing collection first.
 */
export async function importCollection(
  parsed: CsvParseResult,
  mode: "merge" | "replace",
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const repo = getRepo();
  const uniqueIds = [...new Set(parsed.rows.map((r) => r.scryfallId))];
  const byId = new Map<string, ScryCard>();

  const BATCH = 75;
  for (let i = 0; i < uniqueIds.length; i += BATCH) {
    const batch = uniqueIds.slice(i, i + BATCH);
    const resolved = await resolveByIds(batch);
    for (const [id, card] of resolved) byId.set(id, card);
    onProgress?.({
      phase: "resolve",
      resolved: Math.min(i + BATCH, uniqueIds.length),
      total: uniqueIds.length,
    });
  }

  // Cache resolved printings for offline reuse.
  await cacheCards([...byId.values()]).catch(() => {});

  // Build entries, merging duplicate (printing + finish) rows by summing qty.
  const entries = new Map<string, CollectionCard>();
  let unresolvedIds = 0;
  const now = Date.now();
  for (const row of parsed.rows) {
    const card = byId.get(row.scryfallId);
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

  onProgress?.({ phase: "save", resolved: uniqueIds.length, total: uniqueIds.length });

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

  onProgress?.({ phase: "done", resolved: uniqueIds.length, total: uniqueIds.length });
  return {
    added: list.length,
    cards: list.reduce((n, e) => n + e.quantity, 0),
    unresolvedIds,
    skippedRows: parsed.skipped.length,
  };
}
