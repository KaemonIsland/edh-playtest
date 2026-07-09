import { NextRequest, NextResponse } from "next/server";
import type { Legality, ScryCard } from "@/types";
import { query } from "@/lib/repo/pg";
import { scryfallImageUris } from "@/lib/cards/mtgjson";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every printing for a set of Scryfall oracle ids, from the locally-synced
 * MTGJSON tables — so card search can show all variants inline (and add the
 * exact one), instead of a one-printing-per-card oracle view. Newest first.
 *
 * POST { oracleIds: string[] } -> { printings: ScryCard[] }
 */

const LEGALITY: Record<string, Legality> = {
  legal: "legal",
  banned: "banned",
  restricted: "restricted",
};

type PrintRow = {
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
    set: r.set_code?.toLowerCase() ?? undefined,
    set_name: r.set_name ?? undefined,
    collector_number: r.number ?? undefined,
    released_at: r.release_date ?? undefined,
    rarity: r.rarity ?? undefined,
    keywords: r.keywords ?? undefined,
    image_uris: r.scryfall_id ? scryfallImageUris(r.scryfall_id) : undefined,
  };
}

export async function POST(req: NextRequest) {
  let oracleIds: string[];
  try {
    ({ oracleIds } = (await req.json()) as { oracleIds: string[] });
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const ids = Array.isArray(oracleIds) ? [...new Set(oracleIds.filter(Boolean))] : [];
  if (ids.length === 0) return NextResponse.json({ printings: [] });
  try {
    const rows = await query<PrintRow>(
      `select
         i.scryfall_id, i.scryfall_oracle_id as oracle_id,
         c.name, c.mana_cost, c.mana_value, c.type, c.text, c.colors, c.color_identity,
         c.power, c.toughness, c.loyalty, c.layout, c.keywords, c.rarity,
         c.set_code, c.number, s.name as set_name, s.release_date,
         l.commander, l.legacy, l.modern, l.vintage, l.pauper, l.standard,
         l.pioneer, l.brawl, l.oathbreaker, l.predh, l.premodern, l.duel
       from mtg_cards c
       join mtg_identifiers i on i.uuid = c.uuid
       left join mtg_sets s on s.code = c.set_code
       left join mtg_legalities l on l.uuid = c.uuid
       where i.scryfall_oracle_id = any($1) and i.scryfall_id <> ''
         and (c.side is null or c.side = '' or c.side = 'a')
       order by s.release_date desc nulls last, c.set_code, c.number`,
      [ids],
    );
    return NextResponse.json({ printings: rows.map(toCard) });
  } catch (err) {
    // Tables may not exist yet (MTGJSON unsynced) — degrade gracefully.
    console.error("printings failed", err);
    return NextResponse.json({ printings: [] });
  }
}
