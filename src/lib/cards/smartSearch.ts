"use client";

import type { ScryCard } from "@/types";
import { getRepo, type CollectionCard } from "@/lib/repo";
import { fetchPrintings, searchCards } from "./carddb";
import { isScryfallSyntax } from "./otags";

/**
 * Collection-first search for the builder. Scope "collection" answers from
 * cards you own (and swaps in the printing you own); "all" searches everything.
 * Scryfall-syntax queries (otag:, id<=…) always run through the server proxy,
 * then get intersected with the collection client-side when scoped.
 */

export type SearchScope = "collection" | "all";

const SCOPE_KEY = "edh-playtest:builder-scope";

export function getSearchScope(): SearchScope {
  try {
    return window.localStorage.getItem(SCOPE_KEY) === "all" ? "all" : "collection";
  } catch {
    return "collection";
  }
}

export function setSearchScope(scope: SearchScope): void {
  try {
    window.localStorage.setItem(SCOPE_KEY, scope);
  } catch {
    // ignore
  }
}

/** Raw Scryfall query via the server proxy (rate-limited, cached headers). */
export async function scryfallSearch(query: string, limit = 60): Promise<ScryCard[]> {
  const res = await fetch(
    `/api/cards/search?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 175)}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { cards: ScryCard[] };
  return data.cards;
}

// Best owned printing per oracle id, cached briefly — the collection rarely
// changes mid-brew, and quick-search fires on every keystroke.
let ownedCache: { at: number; map: Map<string, CollectionCard> } | null = null;
const OWNED_TTL_MS = 30_000;

async function ownedByOracle(): Promise<Map<string, CollectionCard>> {
  if (ownedCache && Date.now() - ownedCache.at < OWNED_TTL_MS) return ownedCache.map;
  const list = await getRepo().listCollection();
  const map = new Map<string, CollectionCard>();
  for (const c of list) {
    if (c.quantity <= 0) continue;
    const prev = map.get(c.oracleId);
    // Prefer the stack with more copies; nonfoil breaks ties (the usual sleeve).
    if (!prev || c.quantity > prev.quantity || (c.quantity === prev.quantity && c.finish === "nonfoil")) {
      map.set(c.oracleId, c);
    }
  }
  ownedCache = { at: Date.now(), map };
  return map;
}

/** Call after collection edits so scoped search sees them immediately. */
export function invalidateOwnedCache(): void {
  ownedCache = null;
}

/**
 * The omnibox search. Names hit the local DB; Scryfall syntax goes to the
 * proxy. Collection scope filters to owned cards and returns *your* printing.
 */
export async function smartSearch(
  query: string,
  scope: SearchScope,
  limit = 9,
): Promise<ScryCard[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const syntax = isScryfallSyntax(q);
  const wide = scope === "collection" ? Math.max(limit * 10, 120) : limit;
  const cards = syntax ? await scryfallSearch(q, wide) : await searchCards(q, wide);

  if (scope !== "collection") return cards.slice(0, limit);

  const owned = await ownedByOracle();
  const out: ScryCard[] = [];
  for (const c of cards) {
    const mine = owned.get(c.oracle_id);
    if (!mine) continue;
    out.push(mine.card ?? c);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The printing that goes in the deck when adding a card. With the Collection
 * scope on, that's the printing you own — not the newest release.
 */
export async function preferOwnedPrinting(card: ScryCard): Promise<ScryCard> {
  const owned = await getRepo().getCollectionByOracle(card.oracle_id);
  const stacks = owned.filter((o) => o.quantity > 0);
  if (stacks.length === 0) return card;
  stacks.sort(
    (a, b) => b.quantity - a.quantity || (a.finish === "nonfoil" ? -1 : 1),
  );
  return stacks[0]!.card ?? card;
}

/**
 * Resolve an oracle id (+ name fallback) to a full card for swaps/restore:
 * owned printing first, then the local DB by name, then Scryfall printings.
 */
export async function resolveOracle(oracleId: string, name: string): Promise<ScryCard | null> {
  const owned = await getRepo().getCollectionByOracle(oracleId);
  const mine = owned.find((o) => o.quantity > 0);
  if (mine?.card) return mine.card;

  const local = await searchCards(name, 8);
  const exact =
    local.find((c) => c.oracle_id === oracleId) ??
    local.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (exact) return exact;

  const prints = await fetchPrintings(oracleId);
  // fetchPrintings returns oldest→newest; take the newest as the default art.
  return prints[prints.length - 1] ?? local[0] ?? null;
}
