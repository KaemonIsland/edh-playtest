import "server-only";

/**
 * Fetch a deck from a public Archidekt or Moxfield URL and normalize it to a
 * source-agnostic shape. We resolve the actual card data through Scryfall
 * afterwards (by Scryfall id when available, else by name).
 */

export interface ImportedCard {
  name: string;
  quantity: number;
  isCommander: boolean;
  categories: string[];
  scryfallId?: string;
  set?: string;
  collectorNumber?: string;
}

export interface ImportedDeck {
  name: string;
  source: "archidekt" | "moxfield";
  cards: ImportedCard[];
}

export type DeckSource = { source: "archidekt"; id: string } | { source: "moxfield"; id: string };

/** Identify the source + id from a pasted URL (or bare id). */
export function parseDeckUrl(input: string): DeckSource | null {
  const s = input.trim();
  const arch = s.match(/archidekt\.com\/(?:api\/)?decks\/(\d+)/i);
  if (arch) return { source: "archidekt", id: arch[1]! };
  const mox = s.match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i);
  if (mox) return { source: "moxfield", id: mox[1]! };
  // Bare numeric id → assume Archidekt.
  if (/^\d+$/.test(s)) return { source: "archidekt", id: s };
  return null;
}

const UA = "GlitchedGobletPlaytester/0.1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchArchidekt(id: string): Promise<ImportedDeck> {
  const res = await fetch(`https://archidekt.com/api/decks/${id}/`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Archidekt returned ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any;
  const cards: ImportedCard[] = [];
  for (const row of data.cards ?? []) {
    const categories: string[] = Array.isArray(row.categories) ? [...row.categories] : [];
    const isCommander = categories.includes("Commander");
    const name = row.card?.oracleCard?.name ?? row.card?.name;
    if (!name) continue;
    cards.push({
      name,
      quantity: row.quantity ?? 1,
      isCommander,
      categories: categories.filter((c) => c !== "Commander"),
      set: row.card?.edition?.editioncode,
      collectorNumber: row.card?.collectorNumber ? String(row.card.collectorNumber) : undefined,
    });
  }
  return { name: data.name ?? "Imported deck", source: "archidekt", cards };
}

async function fetchMoxfield(id: string): Promise<ImportedDeck> {
  const res = await fetch(`https://api.moxfield.com/v2/decks/all/${id}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      res.status === 403 || res.status === 429
        ? "Moxfield blocked the request (their API is rate-limited/Cloudflare-protected). Try the paste-export fallback."
        : `Moxfield returned ${res.status}`,
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any;
  const cards: ImportedCard[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addBoard = (board: any, isCommander: boolean, category?: string) => {
    for (const key of Object.keys(board ?? {})) {
      const entry = board[key];
      const card = entry?.card;
      const name = card?.name ?? key;
      if (!name) continue;
      cards.push({
        name,
        quantity: entry?.quantity ?? 1,
        isCommander,
        categories: category ? [category] : [],
        scryfallId: card?.scryfall_id,
        set: card?.set,
        collectorNumber: card?.cn ? String(card.cn) : undefined,
      });
    }
  };
  addBoard(data.commanders, true);
  addBoard(data.mainboard, false);
  addBoard(data.sideboard, false, "Sideboard");
  addBoard(data.maybeboard, false, "Maybeboard");
  return { name: data.name ?? "Imported deck", source: "moxfield", cards };
}

export async function fetchDeckFromUrl(input: string): Promise<ImportedDeck> {
  const parsed = parseDeckUrl(input);
  if (!parsed) {
    throw new Error("Not a recognized Archidekt or Moxfield deck URL.");
  }
  return parsed.source === "archidekt" ? fetchArchidekt(parsed.id) : fetchMoxfield(parsed.id);
}
