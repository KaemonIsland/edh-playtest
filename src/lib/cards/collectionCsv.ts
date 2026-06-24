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
 * cleanly here (MTGJSON UUID + Scryfall ID present) and into most other apps.
 * `uuidByPrinting` maps Scryfall printing id → MTGJSON uuid (see
 * `collectionCsvWithUuids`); when absent the UUID column is left blank.
 */
export function collectionToCsv(
  cards: CollectionCard[],
  uuidByPrinting?: Record<string, string>,
): string {
  const header = [
    "Quantity",
    "Card name",
    "Set code",
    "Set name",
    "Collector number",
    "Foil/Variant",
    "Scryfall ID",
    "MTGJSON UUID",
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
        uuidByPrinting?.[c.printingId] ?? "",
      ].join(","),
    );
  }
  return lines.join("\n");
}

/**
 * Build the export CSV with MTGJSON UUIDs resolved from the local
 * mtg_identifiers table (offline). Best-effort: if the lookup fails (tables
 * unsynced), the UUID column is simply left blank.
 */
export async function collectionCsvWithUuids(cards: CollectionCard[]): Promise<string> {
  const ids = [...new Set(cards.filter((c) => c.quantity > 0).map((c) => c.printingId))];
  let map: Record<string, string> = {};
  if (ids.length) {
    try {
      const res = await fetch("/api/mtgjson/resolve-scryfall-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scryfallIds: ids }),
      });
      if (res.ok) ({ map } = (await res.json()) as { map: Record<string, string> });
    } catch {
      // leave UUIDs blank
    }
  }
  return collectionToCsv(cards, map);
}
