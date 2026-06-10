import type { Deck } from "@/types";

export interface DeckWarning {
  severity: "warn" | "info";
  message: string;
}

/**
 * Commander-legality checks. Warnings only — it's a playtester, never block.
 */
export function validateCommanderDeck(deck: Deck): DeckWarning[] {
  const warnings: DeckWarning[] = [];

  if (deck.commanders.length === 0) {
    warnings.push({ severity: "warn", message: "No commander designated." });
  }

  const identity = new Set(deck.commanders.flatMap((c) => c.color_identity));

  let count = 0;
  for (const entry of deck.entries) {
    count += entry.quantity;
    const card = entry.card;

    if (card.legalities["commander"] && card.legalities["commander"] !== "legal") {
      warnings.push({
        severity: "warn",
        message: `${card.name} is ${card.legalities["commander"]?.replace("_", " ")} in Commander.`,
      });
    }

    if (deck.commanders.length > 0) {
      const outside = card.color_identity.filter((c) => !identity.has(c));
      if (outside.length > 0) {
        warnings.push({
          severity: "warn",
          message: `${card.name} (${card.color_identity.join("")}) is outside the commander's color identity.`,
        });
      }
    }

    const basicLand = /\bBasic\b.*\bLand\b/.test(card.type_line);
    const anyNumber = /A deck can have any number of cards named/i.test(card.oracle_text ?? "");
    if (entry.quantity > 1 && !basicLand && !anyNumber) {
      warnings.push({
        severity: "warn",
        message: `${entry.quantity}x ${card.name} — Commander is singleton.`,
      });
    }
  }

  const total = count + deck.commanders.length;
  if (total !== 100) {
    warnings.push({
      severity: "info",
      message: `Deck has ${total} cards including commander(s) (Commander decks are 100).`,
    });
  }

  return warnings;
}
