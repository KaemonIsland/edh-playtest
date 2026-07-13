"use client";

import type { Deck, DeckEntry } from "@/types";
import type { VersionChange, VersionSnapshotEntry } from "@/lib/repo";
import { fetchCardsByIds, searchCards } from "@/lib/cards/carddb";

/**
 * Version snapshots: the full decklist stored with each changelog entry, so
 * any version can be restored into the editor or compared against another.
 */

/** Capture the current list (commanders + boards included, via flags/categories). */
export function snapshotOf(deck: Deck): VersionSnapshotEntry[] {
  return deck.entries.map((e) => ({
    name: e.card.name,
    qty: e.quantity,
    printingId: e.card.id,
    oracleId: e.card.oracle_id,
    ...(e.categories.length > 0 ? { categories: e.categories } : {}),
    ...(e.isCommander ? { commander: true } : {}),
  }));
}

/** Card-name diff between two snapshots (b relative to a). */
export function diffSnapshots(
  a: VersionSnapshotEntry[],
  b: VersionSnapshotEntry[],
): { adds: VersionChange[]; cuts: VersionChange[] } {
  const count = (list: VersionSnapshotEntry[]) => {
    const m = new Map<string, number>();
    for (const e of list) m.set(e.name, (m.get(e.name) ?? 0) + e.qty);
    return m;
  };
  const ma = count(a);
  const mb = count(b);
  const adds: VersionChange[] = [];
  const cuts: VersionChange[] = [];
  for (const [name, qty] of mb) {
    const prev = ma.get(name) ?? 0;
    if (qty > prev) adds.push({ name: qty - prev > 1 ? `${qty - prev}x ${name}` : name });
  }
  for (const [name, qty] of ma) {
    const next = mb.get(name) ?? 0;
    if (next < qty) cuts.push({ name: qty - next > 1 ? `${qty - next}x ${name}` : name });
  }
  return { adds, cuts };
}

export interface RestoreResult {
  deck: Deck;
  /** Names that couldn't be resolved to a card (kept out of the deck). */
  missing: string[];
}

/**
 * Rebuild a draft from a snapshot. Printing ids resolve exactly (Scryfall
 * batch); anything unmatched falls back to the local DB by name. The deck's
 * identity (id, name, pitch, skeleton, settings) is kept from `current` —
 * only the list is rewound.
 */
export async function restoreSnapshot(
  current: Deck,
  snapshot: VersionSnapshotEntry[],
): Promise<RestoreResult> {
  const ids = snapshot.map((s) => s.printingId).filter((x): x is string => !!x);
  const byId = new Map((await fetchCardsByIds(ids)).map((c) => [c.id, c]));

  const entries: DeckEntry[] = [];
  const missing: string[] = [];
  for (const s of snapshot) {
    let card = s.printingId ? byId.get(s.printingId) : undefined;
    if (!card) {
      const found = await searchCards(s.name, 5);
      card =
        found.find((c) => s.oracleId && c.oracle_id === s.oracleId) ??
        found.find((c) => c.name.toLowerCase() === s.name.toLowerCase()) ??
        found[0];
    }
    if (!card) {
      missing.push(s.name);
      continue;
    }
    entries.push({
      card,
      quantity: s.qty,
      isCommander: !!s.commander,
      categories: s.categories ?? [],
    });
  }

  const commanders = entries.filter((e) => e.isCommander).map((e) => e.card);
  return {
    deck: {
      ...current,
      entries,
      commanders,
      colorIdentity: [...new Set(commanders.flatMap((c) => c.color_identity))],
    },
    missing,
  };
}
