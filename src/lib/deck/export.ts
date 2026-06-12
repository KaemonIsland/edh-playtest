import type { Deck } from "@/types";

export type ExportFormat = "plain" | "archidekt" | "moxfield";

/** Serialize a deck to common paste formats. */
export function exportDecklist(deck: Deck, format: ExportFormat): string {
  const main = deck.entries.filter((e) => !e.isCommander);
  const lines: string[] = [];

  switch (format) {
    case "archidekt":
      for (const c of deck.commanders) lines.push(`1x ${c.name} *CMDR*`);
      for (const e of main) {
        lines.push(`${e.quantity}x ${e.card.name}${e.categories[0] ? ` [${e.categories[0]}]` : ""}`);
      }
      break;
    case "moxfield":
      // Moxfield's text import: plain "N Name" lines; commanders flagged on
      // import. We mark the section so it's obvious when pasting.
      if (deck.commanders.length > 0) {
        lines.push("// Commander");
        for (const c of deck.commanders) lines.push(`1 ${c.name}`);
        lines.push("");
        lines.push("// Deck");
      }
      for (const e of main) lines.push(`${e.quantity} ${e.card.name}`);
      break;
    default:
      if (deck.commanders.length > 0) {
        lines.push("// Commander");
        for (const c of deck.commanders) lines.push(`1 ${c.name}`);
        lines.push("");
      }
      for (const e of main) lines.push(`${e.quantity} ${e.card.name}`);
  }
  return lines.join("\n");
}
