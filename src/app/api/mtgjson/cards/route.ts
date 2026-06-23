import { NextResponse } from "next/server";
import type { Legality, ScryCard } from "@/types";
import { query } from "@/lib/repo/pg";
import { scryfallImageUris } from "@/lib/cards/mtgjson";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Oracle-level card database for client search, built from the locally-synced
 * MTGJSON Postgres tables (run `npm run sync:mtgjson` to populate them).
 *
 * For each Scryfall oracle id we pick a representative printing — newest,
 * non-funny — which gives real printing-level rarity / set / collector number
 * (not available oracle-level), then attach deduped rulings aggregated across
 * all of that card's printings. Identity stays the Scryfall id.
 *
 * Returns { rows: { oracle_id, nameKey, card }[] }.
 */

const LEGALITY: Record<string, Legality> = { legal: "legal", banned: "banned", restricted: "restricted" };

type RepRow = {
  oracle_id: string;
  scryfall_id: string;
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

function legalities(r: RepRow): Partial<Record<string, Legality>> {
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

export async function POST() {
  try {
    const reps = await query<RepRow>(`
      select distinct on (i.scryfall_oracle_id)
        i.scryfall_oracle_id as oracle_id, i.scryfall_id,
        c.name, c.mana_cost, c.mana_value, c.type, c.text, c.colors, c.color_identity,
        c.power, c.toughness, c.loyalty, c.layout, c.keywords, c.rarity,
        c.set_code, c.number, s.name as set_name, s.release_date,
        l.commander, l.legacy, l.modern, l.vintage, l.pauper, l.standard,
        l.pioneer, l.brawl, l.oathbreaker, l.predh, l.premodern, l.duel
      from mtg_cards c
      join mtg_identifiers i on i.uuid = c.uuid
      left join mtg_sets s on s.code = c.set_code
      left join mtg_legalities l on l.uuid = c.uuid
      where i.scryfall_id <> '' and i.scryfall_oracle_id <> ''
        and (c.side is null or c.side = '' or c.side = 'a')
      order by i.scryfall_oracle_id, c.is_funny asc nulls last, s.release_date desc nulls last
    `);

    const ruleRows = await query<{ oracle_id: string; rulings: { date: string; text: string }[] }>(`
      select i.scryfall_oracle_id as oracle_id,
             json_agg(distinct jsonb_build_object('date', r.date, 'text', r.text)) as rulings
      from mtg_rulings r
      join mtg_identifiers i on i.uuid = r.uuid
      where i.scryfall_oracle_id <> ''
      group by i.scryfall_oracle_id
    `);
    const rulingsByOracle = new Map(ruleRows.map((r) => [r.oracle_id, r.rulings]));

    const rows = reps.map((r) => {
      const card: ScryCard = {
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
        set: r.set_code ?? undefined,
        set_name: r.set_name ?? undefined,
        collector_number: r.number ?? undefined,
        released_at: r.release_date ?? undefined,
        rarity: r.rarity ?? undefined,
        keywords: r.keywords ?? undefined,
        image_uris: r.scryfall_id ? scryfallImageUris(r.scryfall_id) : undefined,
        rulings: rulingsByOracle.get(r.oracle_id),
      };
      return { oracle_id: r.oracle_id, nameKey: r.name.toLowerCase(), card };
    });

    return NextResponse.json({ rows });
  } catch (err) {
    console.error("MTGJSON card DB build failed", err);
    return NextResponse.json(
      { error: "MTGJSON tables not found. Run `npm run sync:mtgjson` to populate them first." },
      { status: 503 },
    );
  }
}
