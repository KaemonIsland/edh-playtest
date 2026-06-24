import { NextRequest, NextResponse } from "next/server";
import type { Legality, ScryCard } from "@/types";
import { query } from "@/lib/repo/pg";
import { scryfallImageUris } from "@/lib/cards/mtgjson";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Printing-level card resolution for CSV import, entirely against the locally
 * synced MTGJSON tables — no Scryfall round-trip. Unlike /api/mtgjson/cards
 * (oracle-level, one representative printing per card), this returns the EXACT
 * printing the collection row refers to, matched by the import fallback chain:
 *
 *   MTGJSON UUID  →  Scryfall id  →  set code + collector number  →  name
 *
 * POST { uuids?, scryfallIds?, prints?, names? }  (each an array; prints are
 * "setcode:number", lowercased set; names are lowercased card names)
 *   -> { byUuid, byId, bySetCn, byName, byNameSet }  maps of full ScryCards.
 *
 * `byName` is the representative (newest, non-funny) printing per name;
 * `byNameSet` is keyed "name|setcode" so a name-only row can still be pinned to
 * the right set when set+collector didn't line up.
 */

const LEGALITY: Record<string, Legality> = {
  legal: "legal",
  banned: "banned",
  restricted: "restricted",
};

type PrintRow = {
  uuid: string;
  scryfall_id: string;
  oracle_id: string;
  name: string;
  mana_cost: string | null;
  mana_value: number | null;
  type: string;
  text: string | null;
  colors: string[] | null;
  color_identity: string[] | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  layout: string | null;
  keywords: string[] | null;
  rarity: string | null;
  set_code: string | null;
  set_name: string | null;
  number: string | null;
  release_date: string | null;
  commander: string | null;
  legacy: string | null;
  modern: string | null;
  vintage: string | null;
  pauper: string | null;
  standard: string | null;
  pioneer: string | null;
  brawl: string | null;
  oathbreaker: string | null;
  predh: string | null;
  premodern: string | null;
  duel: string | null;
};

function legalities(r: PrintRow): Partial<Record<string, Legality>> {
  const out: Partial<Record<string, Legality>> = {};
  const add = (fmt: string, v: string | null) => {
    const m = v ? LEGALITY[v.toLowerCase()] : undefined;
    if (m) out[fmt] = m;
  };
  add("commander", r.commander);
  add("legacy", r.legacy);
  add("modern", r.modern);
  add("vintage", r.vintage);
  add("pauper", r.pauper);
  add("standard", r.standard);
  add("pioneer", r.pioneer);
  add("brawl", r.brawl);
  add("oathbreaker", r.oathbreaker);
  add("predh", r.predh);
  add("premodern", r.premodern);
  add("duel", r.duel);
  return out;
}

function toCard(r: PrintRow): ScryCard {
  return {
    id: r.scryfall_id,
    oracle_id: r.oracle_id,
    name: r.name,
    mana_cost: r.mana_cost ?? undefined,
    cmc: r.mana_value ?? 0,
    type_line: r.type ?? "",
    oracle_text: r.text ?? undefined,
    colors: r.colors ?? undefined,
    color_identity: r.color_identity ?? [],
    power: r.power ?? undefined,
    toughness: r.toughness ?? undefined,
    loyalty: r.loyalty ?? undefined,
    layout: r.layout ?? "normal",
    legalities: legalities(r),
    // MTGJSON set codes are UPPERCASE ("VOW"); the app (and Scryfall) use
    // lowercase ("vow") everywhere — keep that convention so set-list joins
    // (icons, counts) and set filters line up.
    set: r.set_code?.toLowerCase() ?? undefined,
    set_name: r.set_name ?? undefined,
    collector_number: r.number ?? undefined,
    released_at: r.release_date ?? undefined,
    rarity: r.rarity ?? undefined,
    keywords: r.keywords ?? undefined,
    image_uris: r.scryfall_id ? scryfallImageUris(r.scryfall_id) : undefined,
  };
}

/** Shared select. Callers append a WHERE predicate and ordering. */
const SELECT = `
  select
    c.uuid, i.scryfall_id, i.scryfall_oracle_id as oracle_id,
    c.name, c.mana_cost, c.mana_value, c.type, c.text, c.colors, c.color_identity,
    c.power, c.toughness, c.loyalty, c.layout, c.keywords, c.rarity,
    c.set_code, c.number, s.name as set_name, s.release_date,
    l.commander, l.legacy, l.modern, l.vintage, l.pauper, l.standard,
    l.pioneer, l.brawl, l.oathbreaker, l.predh, l.premodern, l.duel
  from mtg_cards c
  join mtg_identifiers i on i.uuid = c.uuid
  left join mtg_sets s on s.code = c.set_code
  left join mtg_legalities l on l.uuid = c.uuid
  where i.scryfall_id <> '' and (c.side is null or c.side = '' or c.side = 'a')
`;

/** Newest, non-funny printing first — so map "first wins" keeps the representative. */
const ORDER = ` order by c.is_funny asc nulls last, s.release_date desc nulls last`;

interface Body {
  uuids?: string[];
  scryfallIds?: string[];
  prints?: string[];
  names?: string[];
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const uuids = uniq(body.uuids);
  const scryfallIds = uniq(body.scryfallIds);
  const prints = uniq(body.prints);
  const names = uniq(body.names);

  const byUuid: Record<string, ScryCard> = {};
  const byId: Record<string, ScryCard> = {};
  const bySetCn: Record<string, ScryCard> = {};
  const byName: Record<string, ScryCard> = {};
  const byNameSet: Record<string, ScryCard> = {};

  try {
    if (uuids.length) {
      const rows = await query<PrintRow>(`${SELECT} and c.uuid = any($1)${ORDER}`, [uuids]);
      for (const r of rows) byUuid[r.uuid] ??= toCard(r);
    }
    if (scryfallIds.length) {
      const rows = await query<PrintRow>(`${SELECT} and i.scryfall_id = any($1)${ORDER}`, [scryfallIds]);
      for (const r of rows) byId[r.scryfall_id] ??= toCard(r);
    }
    if (prints.length) {
      const rows = await query<PrintRow>(
        `${SELECT} and (lower(c.set_code) || ':' || c.number) = any($1)${ORDER}`,
        [prints],
      );
      for (const r of rows) {
        const key = `${(r.set_code ?? "").toLowerCase()}:${r.number}`;
        bySetCn[key] ??= toCard(r);
      }
    }
    if (names.length) {
      const rows = await query<PrintRow>(`${SELECT} and lower(c.name) = any($1)${ORDER}`, [names]);
      for (const r of rows) {
        const nameKey = r.name.toLowerCase();
        const card = toCard(r);
        byName[nameKey] ??= card; // representative (rows are newest-first)
        if (r.set_code) byNameSet[`${nameKey}|${r.set_code.toLowerCase()}`] ??= card;
      }
    }
    return NextResponse.json({ byUuid, byId, bySetCn, byName, byNameSet });
  } catch (err) {
    // Tables may not exist yet (MTGJSON unsynced) — degrade to empty maps.
    console.error("resolve-collection failed", err);
    return NextResponse.json({ byUuid, byId, bySetCn, byName, byNameSet });
  }
}

function uniq(arr: string[] | undefined): string[] {
  return arr && Array.isArray(arr) ? [...new Set(arr.filter(Boolean))] : [];
}
