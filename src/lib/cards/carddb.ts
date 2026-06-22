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
    set: raw.set,
    set_name: raw.set_name,
    collector_number: raw.collector_number,
    released_at: raw.released_at,
    rarity: raw.rarity,
    keywords: raw.keywords,
    all_parts: Array.isArray(raw.all_parts)
      ? raw.all_parts.map((p: { id: string; component: string; name: string; type_line: string }) => ({
          id: p.id,
          component: p.component,
          name: p.name,
          type_line: p.type_line,
        }))
      : undefined,
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

/** Newest release first; cards without a date (pre-resync) fall back to name. */
export function byNewest(a: ScryCard, b: ScryCard): number {
  const da = a.released_at ?? "";
  const db = b.released_at ?? "";
  if (da && db && da !== db) return db.localeCompare(da);
  if (da && !db) return -1;
  if (!da && db) return 1;
  return a.name.localeCompare(b.name);
}

export type NumOp = "=" | ">=" | "<=";

export interface SearchFilters {
  name?: string;
  /** Type line contains (e.g. "creature", "elf"). Space-separated terms all match. */
  type?: string;
  /** Oracle text contains. */
  text?: string;
  colors?: string[];
  /** "any": at least one color; "exact": exactly these; "identity": fits within. */
  colorMode?: "any" | "exact" | "identity";
  mvOp?: NumOp;
  mv?: number;
  powerOp?: NumOp;
  power?: number;
  toughnessOp?: NumOp;
  toughness?: number;
  /** Rarities to include (common/uncommon/rare/mythic). Empty = any. */
  rarities?: string[];
  /** Keyword/ability the card has (e.g. "flying"). */
  keyword?: string;
  /** Restrict to a set code. */
  set?: string;
  /** Only cards that can be a commander. */
  commander?: boolean;
}

function isCommanderCard(c: ScryCard): boolean {
  const tl = c.type_line.toLowerCase();
  if (tl.includes("legendary") && tl.includes("creature")) return true;
  const text = c.oracle_text ?? c.card_faces?.map((f) => f.oracle_text ?? "").join("\n") ?? "";
  return /can be your commander/i.test(text);
}

function cmpNum(value: number, op: NumOp, target: number): boolean {
  if (op === "=") return value === target;
  if (op === ">=") return value >= target;
  return value <= target;
}

function hasAnyFilter(f: SearchFilters): boolean {
  return Boolean(
    f.name?.trim() ||
      f.type?.trim() ||
      f.text?.trim() ||
      (f.colors && f.colors.length) ||
      f.mv !== undefined ||
      f.power !== undefined ||
      f.toughness !== undefined ||
      (f.rarities && f.rarities.length) ||
      f.keyword?.trim() ||
      f.set?.trim() ||
      f.commander,
  );
}

/** Advanced search: local DB scan when synced, Scryfall query otherwise. */
export async function advancedSearchCards(f: SearchFilters, limit = 120): Promise<ScryCard[]> {
  if (!hasAnyFilter(f)) return [];

  if (getCardDbStatus().syncedAt) {
    const name = f.name?.trim().toLowerCase();
    const typeTerms = f.type?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    const text = f.text?.trim().toLowerCase();
    const colors = f.colors ?? [];
    const rarities = (f.rarities ?? []).map((r) => r.toLowerCase());
    const keyword = f.keyword?.trim().toLowerCase();
    const set = f.set?.trim().toLowerCase();
    const num = (raw: string | undefined): number | null => {
      const n = parseFloat(raw ?? "");
      return Number.isFinite(n) ? n : null;
    };

    const rows = await db.oracle
      .filter((r) => {
        const c = r.card;
        if (name && !r.nameKey.includes(name)) return false;
        if (typeTerms.length) {
          const tl = c.type_line.toLowerCase();
          if (!typeTerms.every((t) => tl.includes(t))) return false;
        }
        if (text) {
          const oracle =
            c.oracle_text ?? c.card_faces?.map((x) => x.oracle_text ?? "").join("\n") ?? "";
          if (!oracle.toLowerCase().includes(text)) return false;
        }
        if (colors.length > 0) {
          const cardColors = c.colors ?? [];
          if (f.colorMode === "identity") {
            if (!c.color_identity.every((x) => colors.includes(x))) return false;
          } else if (f.colorMode === "exact") {
            if (cardColors.length !== colors.length || !colors.every((x) => cardColors.includes(x)))
              return false;
          } else if (!cardColors.some((x) => colors.includes(x))) return false;
        }
        if (f.mv !== undefined && f.mvOp && !cmpNum(c.cmc, f.mvOp, f.mv)) return false;
        if (f.power !== undefined && f.powerOp) {
          const p = num(c.power);
          if (p === null || !cmpNum(p, f.powerOp, f.power)) return false;
        }
        if (f.toughness !== undefined && f.toughnessOp) {
          const t = num(c.toughness);
          if (t === null || !cmpNum(t, f.toughnessOp, f.toughness)) return false;
        }
        if (rarities.length && !rarities.includes((c.rarity ?? "").toLowerCase())) return false;
        if (keyword && !(c.keywords ?? []).some((k) => k.toLowerCase() === keyword)) return false;
        if (set && (c.set ?? "").toLowerCase() !== set) return false;
        if (f.commander && !isCommanderCard(c)) return false;
        return true;
      })
      .limit(limit)
      .toArray();
    return rows.map((r) => r.card).sort(byNewest);
  }

  // Fallback: build a Scryfall query string.
  const parts: string[] = [];
  if (f.name?.trim()) parts.push(f.name.trim());
  if (f.type?.trim()) for (const t of f.type.trim().split(/\s+/)) parts.push(`t:${t}`);
  if (f.text?.trim()) parts.push(`o:"${f.text.trim()}"`);
  if (f.colors && f.colors.length > 0) {
    const letters = f.colors.join("").toLowerCase();
    if (f.colorMode === "identity") parts.push(`id<=${letters || "c"}`);
    else if (f.colorMode === "exact") parts.push(`c=${letters || "c"}`);
    else parts.push(`(${f.colors.map((c) => `c:${c.toLowerCase()}`).join(" or ")})`);
  }
  if (f.mv !== undefined && f.mvOp) parts.push(`mv${f.mvOp === "=" ? "=" : f.mvOp}${f.mv}`);
  if (f.power !== undefined && f.powerOp) parts.push(`pow${f.powerOp === "=" ? "=" : f.powerOp}${f.power}`);
  if (f.toughness !== undefined && f.toughnessOp)
    parts.push(`tou${f.toughnessOp === "=" ? "=" : f.toughnessOp}${f.toughness}`);
  if (f.rarities && f.rarities.length) parts.push(`(${f.rarities.map((r) => `r:${r}`).join(" or ")})`);
  if (f.keyword?.trim()) parts.push(`keyword:${f.keyword.trim()}`);
  if (f.set?.trim()) parts.push(`s:${f.set.trim()}`);
  if (f.commander) parts.push("is:commander");
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

export interface SetInfo {
  code: string;
  name: string;
  released_at?: string;
  icon_svg_uri?: string;
  card_count: number;
  set_type: string;
}

const SETS_CACHE_KEY = "edh-playtest:sets";
const SETS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Full set list (cached in localStorage for a week). */
export async function fetchAllSets(): Promise<SetInfo[]> {
  try {
    const raw = localStorage.getItem(SETS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; sets: SetInfo[] };
      if (Date.now() - parsed.at < SETS_TTL_MS && parsed.sets.length) return parsed.sets;
    }
  } catch {
    // ignore
  }
  const res = await fetch("/api/sets");
  if (!res.ok) return [];
  const data = (await res.json()) as { sets: SetInfo[] };
  try {
    localStorage.setItem(SETS_CACHE_KEY, JSON.stringify({ at: Date.now(), sets: data.sets }));
  } catch {
    // ignore
  }
  return data.sets;
}

/** Every printing in a set (by collector number). */
export async function fetchSetCards(code: string): Promise<ScryCard[]> {
  const res = await fetch(`/api/cards/set?code=${encodeURIComponent(code)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { cards: ScryCard[] };
  return data.cards;
}

/** Resolve specific printings by Scryfall id (batched at 75). */
export async function fetchCardsByIds(ids: string[]): Promise<ScryCard[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  const out: ScryCard[] = [];
  for (let i = 0; i < unique.length; i += 75) {
    const res = await fetch("/api/cards/by-ids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unique.slice(i, i + 75) }),
    });
    if (!res.ok) continue;
    const data = (await res.json()) as { cards: ScryCard[] };
    out.push(...data.cards);
  }
  return out;
}
