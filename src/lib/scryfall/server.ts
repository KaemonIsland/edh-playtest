import type { ScryCard, ScryCardFace, ScryImageUris } from "@/types";

/**
 * Server-side Scryfall client. All Scryfall traffic goes through here so we
 * can set compliant User-Agent/Accept headers and respect rate limits:
 * /cards/collection is batched at <=75 identifiers and called at <=2 req/s.
 */

const SCRYFALL = "https://api.scryfall.com";
const HEADERS = {
  "User-Agent": "GlitchedGobletPlaytester/0.1",
  Accept: "application/json",
  "Content-Type": "application/json",
};
const BATCH_SIZE = 75;
const MIN_INTERVAL_MS = 500; // 2 requests/second

let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

/** Serialize Scryfall requests and space them >=500ms apart. */
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  });
  queue = run.catch(() => {});
  await run;
  return fn();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawCard = Record<string, any>;

function pickImageUris(uris: RawCard | undefined): ScryImageUris | undefined {
  if (!uris) return undefined;
  const { small, normal, large, png, art_crop, border_crop } = uris;
  return { small, normal, large, png, art_crop, border_crop };
}

function pickFace(face: RawCard): ScryCardFace {
  return {
    name: face.name,
    mana_cost: face.mana_cost,
    type_line: face.type_line,
    oracle_text: face.oracle_text,
    colors: face.colors,
    power: face.power,
    toughness: face.toughness,
    loyalty: face.loyalty,
    image_uris: pickImageUris(face.image_uris),
  };
}

/** Trim a raw Scryfall card down to the ScryCard subset we store. */
export function toScryCard(raw: RawCard): ScryCard {
  return {
    id: raw.id,
    oracle_id: raw.oracle_id ?? raw.card_faces?.[0]?.oracle_id ?? raw.id,
    name: raw.name,
    mana_cost: raw.mana_cost ?? raw.card_faces?.[0]?.mana_cost,
    cmc: raw.cmc ?? 0,
    type_line: raw.type_line ?? raw.card_faces?.[0]?.type_line ?? "",
    oracle_text: raw.oracle_text ?? undefined,
    colors: raw.colors,
    color_identity: raw.color_identity ?? [],
    produced_mana: raw.produced_mana,
    power: raw.power,
    toughness: raw.toughness,
    loyalty: raw.loyalty,
    layout: raw.layout ?? "normal",
    card_faces: raw.card_faces?.map(pickFace),
    image_uris: pickImageUris(raw.image_uris),
    legalities: raw.legalities ?? {},
    prices: raw.prices
      ? { usd: raw.prices.usd, usd_foil: raw.prices.usd_foil, eur: raw.prices.eur }
      : undefined,
  };
}

export interface ResolveResult {
  cards: ScryCard[];
  notFound: string[];
}

/**
 * Resolve exact card names via POST /cards/collection (batched at 75),
 * falling back to /cards/named?fuzzy= for anything unresolved.
 */
export async function resolveCardNames(names: string[]): Promise<ResolveResult> {
  const unique = [...new Set(names)];
  const cards: ScryCard[] = [];
  const unresolved: string[] = [];

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const res = await throttled(() =>
      fetch(`${SCRYFALL}/cards/collection`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
      }),
    );
    if (!res.ok) {
      // Whole batch failed (network/5xx) — try each via fuzzy below.
      unresolved.push(...batch);
      continue;
    }
    const data = (await res.json()) as { data: RawCard[]; not_found?: { name: string }[] };
    cards.push(...data.data.map(toScryCard));
    unresolved.push(...(data.not_found ?? []).map((n) => n.name));
  }

  const notFound: string[] = [];
  for (const name of unresolved) {
    const card = await fuzzyNamed(name);
    if (card) cards.push(card);
    else notFound.push(name);
  }

  return { cards, notFound };
}

export async function fuzzyNamed(name: string): Promise<ScryCard | null> {
  const res = await throttled(() =>
    fetch(`${SCRYFALL}/cards/named?fuzzy=${encodeURIComponent(name)}`, {
      headers: HEADERS,
    }),
  );
  if (!res.ok) return null;
  return toScryCard(await res.json());
}

/** Name search (fallback when the local card DB isn't synced). */
export async function searchCardsByName(query: string): Promise<ScryCard[]> {
  const res = await throttled(() =>
    fetch(
      `${SCRYFALL}/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=name`,
      { headers: HEADERS },
    ),
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { data: RawCard[] };
  return data.data.slice(0, 30).map(toScryCard);
}

/** Every printing of an oracle id (variation picker). */
export async function searchPrintings(oracleId: string): Promise<ScryCard[]> {
  const res = await throttled(() =>
    fetch(
      `${SCRYFALL}/cards/search?q=${encodeURIComponent(`oracleid:${oracleId}`)}&unique=prints&order=released`,
      { headers: HEADERS },
    ),
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { data: RawCard[] };
  return data.data.slice(0, 60).map(toScryCard);
}

/** Search Scryfall for token cards matching a query. */
export async function searchTokens(query: string): Promise<ScryCard[]> {
  const q = `${query} include:extras (t:token or t:emblem)`;
  const res = await throttled(() =>
    fetch(`${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&unique=cards`, {
      headers: HEADERS,
    }),
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { data: RawCard[] };
  return data.data.slice(0, 30).map(toScryCard);
}
