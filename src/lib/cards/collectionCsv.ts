import type { CollectionCard, CardFinish } from "@/lib/repo";

const FINISH_OUT: Record<CardFinish, string> = {
  nonfoil: "",
  foil: "Foil",
  etched: "Etched",
};

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Export the collection as CSV. Columns are chosen so this file re-imports
 * cleanly here (Scryfall ID present) and into most other apps.
 */
export function collectionToCsv(cards: CollectionCard[]): string {
  const header = [
    "Quantity",
    "Card name",
    "Set code",
    "Set name",
    "Collector number",
    "Foil/Variant",
    "Scryfall ID",
  ];
  const lines = [header.join(",")];
  for (const c of cards) {
    if (c.quantity <= 0) continue;
    lines.push(
      [
        String(c.quantity),
        csvCell(c.name),
        csvCell((c.setCode ?? c.card.set ?? "").toUpperCase()),
        csvCell(c.setName ?? c.card.set_name ?? ""),
        csvCell(c.collectorNumber ?? c.card.collector_number ?? ""),
        FINISH_OUT[c.finish],
        c.printingId,
      ].join(","),
    );
  }
  return lines.join("\n");
}
