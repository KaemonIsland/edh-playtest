"use client";

import type { ScryCard } from "@/types";
import { db, normalizeCardName } from "@/lib/db";
import { getCardDbStatus } from "./carddb";
import { resolveCards } from "@/lib/scryfall/resolve";

/**
 * Data plumbing for the builder's Suggestions modal: EDHREC commander
 * suggestions (with synergy metrics) resolved to full cards, local-DB first.
 */

export interface EdhrecSuggestion {
  name: string;
  header: string;
  synergy?: number;
  numDecks?: number;
  potentialDecks?: number;
}

export async function fetchEdhrecSuggestions(commander: string): Promise<EdhrecSuggestion[]> {
  const res = await fetch(`/api/edhrec?commander=${encodeURIComponent(commander)}&mode=cards`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `EDHREC lookup failed (${res.status})`);
  }
  const data = (await res.json()) as { cards: EdhrecSuggestion[] };
  return data.cards;
}

/**
 * Resolve many card names to cards: the synced oracle DB answers in one
 * indexed query; anything left (new-set cards, unsynced DB) goes through the
 * cache-first Scryfall resolver. Keys of the returned map are normalized
 * front-face names (see normalizeCardName).
 */
export async function resolveNames(names: string[]): Promise<Map<string, ScryCard>> {
  const unique = [...new Set(names)];
  const out = new Map<string, ScryCard>();

  if (getCardDbStatus().syncedAt) {
    // nameKey stores the lowercased full name; try both the full and the
    // front-face key so DFC suggestions ("A // B") resolve either way.
    const keys = new Set<string>();
    for (const n of unique) {
      keys.add(n.trim().toLowerCase());
      keys.add(normalizeCardName(n));
    }
    const rows = await db.oracle.where("nameKey").anyOf([...keys]).toArray();
    for (const r of rows) out.set(normalizeCardName(r.card.name), r.card);
  }

  const missing = unique.filter((n) => !out.has(normalizeCardName(n)));
  if (missing.length > 0 && missing.length <= 150) {
    try {
      const { byName } = await resolveCards(missing);
      for (const [name, card] of byName) out.set(normalizeCardName(name), card);
    } catch {
      // best-effort: unresolved suggestions are simply dropped
    }
  }
  return out;
}

/** Look a resolved suggestion up by its EDHREC name. */
export function lookupResolved(map: Map<string, ScryCard>, name: string): ScryCard | undefined {
  return map.get(normalizeCardName(name));
}
