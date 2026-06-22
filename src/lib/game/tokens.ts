"use client";

import type { Deck, ScryCard } from "@/types";
import { fetchCardsByIds } from "@/lib/cards/carddb";

/** Collect the distinct token Scryfall ids a set of cards creates. */
function tokenIdsFrom(cards: ScryCard[]): { ids: Set<string>; sawParts: boolean } {
  const ids = new Set<string>();
  let sawParts = false;
  for (const c of cards) {
    if (c.all_parts) {
      sawParts = true;
      for (const p of c.all_parts) {
        if (p.component === "token") ids.add(p.id);
      }
    }
  }
  return { ids, sawParts };
}

/**
 * Resolve every token a deck can make, from its cards' Scryfall `all_parts`.
 * Falls back to re-fetching the deck's cards when they were stored before
 * `all_parts` was tracked, so older decks still get their tokens.
 */
export async function resolveDeckTokens(deck: Deck): Promise<ScryCard[]> {
  const deckCards = [...deck.commanders, ...deck.entries.map((e) => e.card)];
  let { ids, sawParts } = tokenIdsFrom(deckCards);

  if (!sawParts) {
    // Older deck data lacks all_parts — re-fetch the printings to read it.
    const fresh = await fetchCardsByIds(deckCards.map((c) => c.id));
    ids = tokenIdsFrom(fresh).ids;
  }

  if (ids.size === 0) return [];
  const tokens = await fetchCardsByIds([...ids]);
  return tokens.sort((a, b) => a.name.localeCompare(b.name));
}
