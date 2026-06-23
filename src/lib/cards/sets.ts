import type { CollectionCard } from "@/lib/repo";
import { priceOf } from "@/lib/cards/pricing";

/** Format an ISO date (YYYY-MM-DD) as MM/DD/YYYY without timezone drift. */
export function formatDate(iso?: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

export interface OwnedSetGroup {
  code: string;
  name: string;
  released: string;
  unique: number;
  total: number;
  value: number;
}

/** Group owned cards into sets, newest first. */
export function groupBySet(cards: CollectionCard[]): OwnedSetGroup[] {
  const map = new Map<string, OwnedSetGroup & { printings: Set<string> }>();
  for (const c of cards) {
    const code = c.setCode ?? c.card.set ?? "unknown";
    let g = map.get(code);
    if (!g) {
      g = {
        code,
        name: c.setName ?? c.card.set_name ?? code.toUpperCase(),
        released: c.card.released_at ?? "",
        unique: 0,
        total: 0,
        value: 0,
        printings: new Set(),
      };
      map.set(code, g);
    }
    g.printings.add(c.printingId);
    g.total += c.quantity;
    const unit = priceOf(c.card, c.finish);
    if (unit !== null) g.value += unit * c.quantity;
  }
  return [...map.values()]
    .map(({ printings, ...g }) => ({ ...g, unique: printings.size }))
    .sort((a, b) => (b.released ?? "").localeCompare(a.released ?? "") || a.name.localeCompare(b.name));
}
