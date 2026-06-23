"use client";

import { create } from "zustand";
import type { ScryCard } from "@/types";
import type { CardFinish } from "@/lib/repo";
import { db, type CardPriceRow } from "@/lib/db";

/**
 * Card pricing, sourced from MTGJSON and keyed by Scryfall id.
 *
 * Prices live in IndexedDB (disposable cache, like the card-search DB) and are
 * mirrored into an in-memory index so `priceOf()` stays synchronous for the
 * many places that compute collection/deck value. The active provider
 * (TCGplayer ⇄ Card Kingdom) is a user toggle, persisted to localStorage.
 * Scryfall's embedded `usd` is the fallback when MTGJSON has no row yet.
 */

export type PriceSource = "tcgplayer" | "cardkingdom";

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  tcgplayer: "TCGplayer",
  cardkingdom: "Card Kingdom",
};

const SOURCE_KEY = "edh-playtest:price-source";
const SYNC_META_KEY = "edh-playtest:prices-sync";

function loadSource(): PriceSource {
  try {
    const v = localStorage.getItem(SOURCE_KEY);
    if (v === "tcgplayer" || v === "cardkingdom") return v;
  } catch {
    // ignore
  }
  return "tcgplayer";
}

interface PriceStore {
  source: PriceSource;
  /** Bumped whenever the in-memory index changes, so memoized values recompute. */
  version: number;
  setSource: (source: PriceSource) => void;
  bumpVersion: () => void;
}

export const usePriceStore = create<PriceStore>((set) => ({
  source: typeof window !== "undefined" ? loadSource() : "tcgplayer",
  version: 0,
  setSource: (source) => {
    try {
      localStorage.setItem(SOURCE_KEY, source);
    } catch {
      // ignore
    }
    set({ source });
  },
  bumpVersion: () => set((s) => ({ version: s.version + 1 })),
}));

export function getActiveSource(): PriceSource {
  return usePriceStore.getState().source;
}

// --- in-memory index ---------------------------------------------------------

const index = new Map<string, CardPriceRow>();
let loaded = false;
let loading: Promise<void> | null = null;

/** Load the price index from IndexedDB into memory (once). Idempotent. */
export async function loadPriceIndex(): Promise<void> {
  if (loaded) return;
  if (!loading) {
    loading = (async () => {
      try {
        const rows = await db.prices.toArray();
        index.clear();
        for (const r of rows) index.set(r.id, r);
      } catch {
        // ignore — falls back to Scryfall prices
      }
      loaded = true;
      if (index.size) usePriceStore.getState().bumpVersion();
    })();
  }
  return loading;
}

/** Replace the stored + in-memory price index (called by the MTGJSON sync). */
export async function replacePriceIndex(rows: CardPriceRow[]): Promise<void> {
  const CHUNK = 2000;
  await db.prices.clear();
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.prices.bulkPut(rows.slice(i, i + CHUNK));
  }
  index.clear();
  for (const r of rows) index.set(r.id, r);
  loaded = true;
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ syncedAt: Date.now(), count: rows.length }));
  } catch {
    // ignore
  }
  usePriceStore.getState().bumpVersion();
}

/**
 * Pull fresh prices from MTGJSON (server route) and replace the local index.
 * Returns the number of priced printings stored.
 */
export async function syncPrices(): Promise<number> {
  const res = await fetch("/api/mtgjson/prices", { method: "POST" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Price sync failed (${res.status})`);
  }
  const { rows } = (await res.json()) as { rows: CardPriceRow[] };
  await replacePriceIndex(rows);
  return rows.length;
}

export interface PriceSyncStatus {
  syncedAt: number | null;
  count: number;
}

export function getPriceSyncStatus(): PriceSyncStatus {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (raw) return JSON.parse(raw) as PriceSyncStatus;
  } catch {
    // ignore
  }
  return { syncedAt: null, count: 0 };
}

// --- lookups -----------------------------------------------------------------

function fromScryfall(card: ScryCard, finish: CardFinish): number | null {
  const raw = finish === "nonfoil" ? card.prices?.usd : card.prices?.usd_foil;
  const n = parseFloat(raw ?? "");
  return Number.isFinite(n) ? n : null;
}

function fromIndex(id: string, finish: CardFinish, source: PriceSource): number | null {
  const row = index.get(id);
  if (!row) return null;
  const foil = finish !== "nonfoil";
  const v = source === "cardkingdom" ? (foil ? row.ckFoil : row.ck) : foil ? row.tcgFoil : row.tcg;
  return typeof v === "number" ? v : null;
}

/**
 * Unit price for a printing+finish from the active (or given) provider, falling
 * back to the other provider, then to Scryfall's embedded price. Synchronous —
 * relies on `loadPriceIndex()` having run (no-op until then, so it degrades to
 * Scryfall prices rather than throwing).
 */
export function priceOf(card: ScryCard, finish: CardFinish, source?: PriceSource): number | null {
  const src = source ?? getActiveSource();
  const other: PriceSource = src === "tcgplayer" ? "cardkingdom" : "tcgplayer";
  return fromIndex(card.id, finish, src) ?? fromIndex(card.id, finish, other) ?? fromScryfall(card, finish);
}
