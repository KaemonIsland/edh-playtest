"use client";

import type { ScryCard } from "@/types";
import { db } from "@/lib/db";

/**
 * Local card database: Scryfall's `oracle_cards` bulk file (~35MB, updated
 * daily, published for exactly this purpose) synced into IndexedDB. Card
 * search runs locally once synced; images stay on Scryfall's CDN (and are
 * browser-cached). The API-route search remains as a fallback when unsynced.
 */

const SYNC_META_KEY = "edh-playtest:carddb-sync";

export interface CardDbStatus {
  syncedAt: number | null;
  count: number;
}

export function getCardDbStatus(): CardDbStatus {
  try {
    const raw = window.localStorage.getItem(SYNC_META_KEY);
    return raw ? (JSON.parse(raw) as CardDbStatus) : { syncedAt: null, count: 0 };
  } catch {
    return { syncedAt: null, count: 0 };
  }
}

export interface SyncProgress {
  phase: "manifest" | "download" | "store" | "done";
  stored: number;
  total: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawCard = Record<string, any>;

function slim(raw: RawCard): ScryCard {
  return {
    id: raw.id,
    oracle_id: raw.oracle_id ?? raw.id,
    name: raw.name,
    mana_cost: raw.mana_cost ?? raw.card_faces?.[0]?.mana_cost,
    cmc: raw.cmc ?? 0,
    type_line: raw.type_line ?? raw.card_faces?.[0]?.type_line ?? "",
    oracle_text: raw.oracle_text,
    colors: raw.colors,
    color_identity: raw.color_identity ?? [],
    produced_mana: raw.produced_mana,
    power: raw.power,
    toughness: raw.toughness,
    loyalty: raw.loyalty,
    layout: raw.layout ?? "normal",
    card_faces: raw.card_faces?.map((f: RawCard) => ({
      name: f.name,
      mana_cost: f.mana_cost,
      type_line: f.type_line,
      oracle_text: f.oracle_text,
      colors: f.colors,
      power: f.power,
      toughness: f.toughness,
      loyalty: f.loyalty,
      image_uris: f.image_uris
        ? { small: f.image_uris.small, normal: f.image_uris.normal, art_crop: f.image_uris.art_crop }
        : undefined,
    })),
    image_uris: raw.image_uris
      ? {
          small: raw.image_uris.small,
          normal: raw.image_uris.normal,
          art_crop: raw.image_uris.art_crop,
        }
      : undefined,
    legalities: { commander: raw.legalities?.commander },
    prices: raw.prices ? { usd: raw.prices.usd } : undefined,
  };
}

/** Download + store the bulk database. Re-run any time to refresh. */
export async function syncCardDatabase(
  onProgress?: (p: SyncProgress) => void,
): Promise<CardDbStatus> {
  onProgress?.({ phase: "manifest", stored: 0, total: 0 });
  const manifest = await fetch("https://api.scryfall.com/bulk-data/oracle-cards", {
    headers: { Accept: "application/json" },
  });
  if (!manifest.ok) throw new Error(`Bulk manifest failed (${manifest.status})`);
  const { download_uri } = (await manifest.json()) as { download_uri: string };

  onProgress?.({ phase: "download", stored: 0, total: 0 });
  const res = await fetch(download_uri);
  if (!res.ok) throw new Error(`Bulk download failed (${res.status})`);
  const all = (await res.json()) as RawCard[];

  // Skip pure art/token/meme layouts that aren't deck-buildable.
  const SKIP_LAYOUTS = new Set(["art_series", "token", "double_faced_token", "emblem", "planar", "scheme", "vanguard"]);
  const rows = all
    .filter((c) => !SKIP_LAYOUTS.has(c.layout) && c.oracle_id)
    .map((c) => ({ oracle_id: c.oracle_id as string, nameKey: (c.name as string).toLowerCase(), card: slim(c) }));

  onProgress?.({ phase: "store", stored: 0, total: rows.length });
  await db.oracle.clear();
  const CHUNK = 2000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.oracle.bulkPut(rows.slice(i, i + CHUNK));
    onProgress?.({ phase: "store", stored: Math.min(i + CHUNK, rows.length), total: rows.length });
  }

  const status: CardDbStatus = { syncedAt: Date.now(), count: rows.length };
  window.localStorage.setItem(SYNC_META_KEY, JSON.stringify(status));
  onProgress?.({ phase: "done", stored: rows.length, total: rows.length });
  return status;
}

/**
 * Card search: local DB when synced (name prefix + substring), Scryfall API
 * route otherwise.
 */
export async function searchCards(query: string, limit = 30): Promise<ScryCard[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  if (getCardDbStatus().syncedAt) {
    // Prefix matches first (indexed), then substring scan to fill.
    const prefix = await db.oracle.where("nameKey").startsWith(q).limit(limit).toArray();
    let results = prefix.map((r) => r.card);
    if (results.length < limit) {
      const seen = new Set(results.map((c) => c.oracle_id));
      const more = await db.oracle
        .filter((r) => !seen.has(r.oracle_id) && r.nameKey.includes(q))
        .limit(limit - results.length)
        .toArray();
      results = results.concat(more.map((r) => r.card));
    }
    return results;
  }

  const res = await fetch(`/api/cards/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { cards: ScryCard[] };
  return data.cards;
}

export interface SearchFilters {
  name?: string;
  /** Type line contains (e.g. "creature", "elf"). */
  type?: string;
  /** Oracle text contains. */
  text?: string;
  colors?: string[];
  /** "any": card is at least one of the colors; "identity": fits within them. */
  colorMode?: "any" | "identity";
  mvOp?: "=" | ">=" | "<=";
  mv?: number;
}

/** Advanced search: local DB scan when synced, Scryfall query otherwise. */
export async function advancedSearchCards(f: SearchFilters, limit = 120): Promise<ScryCard[]> {
  if (getCardDbStatus().syncedAt) {
    const name = f.name?.trim().toLowerCase();
    const type = f.type?.trim().toLowerCase();
    const text = f.text?.trim().toLowerCase();
    const colors = f.colors ?? [];
    const rows = await db.oracle
      .filter((r) => {
        const c = r.card;
        if (name && !r.nameKey.includes(name)) return false;
        if (type && !c.type_line.toLowerCase().includes(type)) return false;
        if (text) {
          const oracle =
            c.oracle_text ?? c.card_faces?.map((x) => x.oracle_text ?? "").join("\n") ?? "";
          if (!oracle.toLowerCase().includes(text)) return false;
        }
        if (colors.length > 0) {
          if (f.colorMode === "identity") {
            if (!c.color_identity.every((x) => colors.includes(x))) return false;
          } else {
            const cardColors = c.colors ?? c.color_identity;
            if (!cardColors.some((x) => colors.includes(x))) return false;
          }
        }
        if (f.mv !== undefined && f.mvOp) {
          if (f.mvOp === "=" && c.cmc !== f.mv) return false;
          if (f.mvOp === ">=" && c.cmc < f.mv) return false;
          if (f.mvOp === "<=" && c.cmc > f.mv) return false;
        }
        return true;
      })
      .limit(limit)
      .toArray();
    return rows.map((r) => r.card).sort((a, b) => a.name.localeCompare(b.name));
  }

  // Fallback: build a Scryfall query string.
  const parts: string[] = [];
  if (f.name?.trim()) parts.push(f.name.trim());
  if (f.type?.trim()) parts.push(`t:"${f.type.trim()}"`);
  if (f.text?.trim()) parts.push(`o:"${f.text.trim()}"`);
  if (f.colors && f.colors.length > 0) {
    const letters = f.colors.join("").toLowerCase();
    parts.push(f.colorMode === "identity" ? `id<=${letters || "c"}` : `(${f.colors.map((c) => `c:${c.toLowerCase()}`).join(" or ")})`);
  }
  if (f.mv !== undefined && f.mvOp) parts.push(`mv${f.mvOp === "=" ? "=" : f.mvOp}${f.mv}`);
  if (parts.length === 0) return [];
  const res = await fetch(`/api/cards/search?q=${encodeURIComponent(parts.join(" "))}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { cards: ScryCard[] };
  return data.cards;
}

/** All printings of a card (for the variation picker). Always via Scryfall. */
export async function fetchPrintings(oracleId: string): Promise<ScryCard[]> {
  const res = await fetch(`/api/cards/prints?oracle=${encodeURIComponent(oracleId)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { cards: ScryCard[] };
  return data.cards;
}
