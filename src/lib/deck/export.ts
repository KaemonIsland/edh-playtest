import type { Deck, DeckEntry } from "@/types";

export type ExportFormat = "plain" | "archidekt" | "moxfield";

function splitBoards(deck: Deck): { main: DeckEntry[]; side: DeckEntry[] } {
  const settings = deck.categorySettings ?? {};
  const main: DeckEntry[] = [];
  const side: DeckEntry[] = [];
  for (const e of deck.entries) {
    if (e.isCommander) continue;
    const cat = e.categories[0];
    if (cat && settings[cat]?.inDeck === false) side.push(e);
    else main.push(e);
  }
  return { main, side };
}

/** Serialize a deck to common paste formats (sideboards included). */
export function exportDecklist(deck: Deck, format: ExportFormat): string {
  const { main, side } = splitBoards(deck);
  const lines: string[] = [];

  switch (format) {
    case "archidekt":
      for (const c of deck.commanders) lines.push(`1x ${c.name} *CMDR*`);
      for (const e of main) {
        lines.push(`${e.quantity}x ${e.card.name}${e.categories[0] ? ` [${e.categories[0]}]` : ""}`);
      }
      for (const e of side) {
        lines.push(`${e.quantity}x ${e.card.name} [${e.categories[0] ?? "Sideboard"}]`);
      }
      break;
    case "moxfield":
      // Moxfield's text import: plain "N Name" lines with SB: for sideboard.
      if (deck.commanders.length > 0) {
        lines.push("// Commander");
        for (const c of deck.commanders) lines.push(`1 ${c.name}`);
        lines.push("");
        lines.push("// Deck");
      }
      for (const e of main) lines.push(`${e.quantity} ${e.card.name}`);
      if (side.length > 0) {
        lines.push("");
        for (const e of side) lines.push(`SB: ${e.quantity} ${e.card.name}`);
      }
      break;
    default:
      if (deck.commanders.length > 0) {
        lines.push("// Commander");
        for (const c of deck.commanders) lines.push(`1 ${c.name}`);
        lines.push("");
      }
      for (const e of main) lines.push(`${e.quantity} ${e.card.name}`);
      if (side.length > 0) {
        lines.push("");
        lines.push("// Sideboard");
        for (const e of side) lines.push(`SB: ${e.quantity} ${e.card.name}`);
      }
  }
  return lines.join("\n");
}
