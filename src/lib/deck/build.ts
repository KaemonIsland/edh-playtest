"use client";

import type { Deck, DeckEntry } from "@/types";
import { isCreature } from "@/types";
import { parseDecklist } from "./parse";
import { resolveCards } from "@/lib/scryfall/resolve";
import { uid } from "@/lib/game/ids";

export interface BuiltDeck {
  deck: Deck;
  notFound: string[];
  warnings: string[];
}

/**
 * One-shot decklist → resolved Deck (used for opponent decks; the main import
 * flow keeps its interactive fix-up UI). If no commander is marked, falls back
 * to the first legendary creature in the list.
 */
export async function buildDeckFromText(text: string, name: string): Promise<BuiltDeck> {
  const parsed = parseDecklist(text);
  const { byName, notFound } = await resolveCards(parsed.lines.map((l) => l.name));

  const entries: DeckEntry[] = [];
  for (const line of parsed.lines) {
    const card = byName.get(line.name);
    if (!card) continue;
    entries.push({
      card,
      quantity: line.quantity,
      isCommander: line.isCommander,
      categories: line.categories,
    });
  }

  if (!entries.some((e) => e.isCommander)) {
    const legend = entries.find(
      (e) => /\bLegendary\b/.test(e.card.type_line) && isCreature(e.card.type_line),
    );
    if (legend) legend.isCommander = true;
  }

  const commanders = entries.filter((e) => e.isCommander).map((e) => e.card);
  // The commander shouldn't also sit in the 99 if the list repeated it.
  const deduped = entries.filter(
    (e) => e.isCommander || !commanders.some((c) => c.oracle_id === e.card.oracle_id),
  );

  return {
    deck: {
      id: uid("deck"),
      name,
      format: "commander",
      commanders,
      entries: deduped,
      colorIdentity: [...new Set(commanders.flatMap((c) => c.color_identity))],
    },
    notFound,
    warnings: parsed.warnings,
  };
}
