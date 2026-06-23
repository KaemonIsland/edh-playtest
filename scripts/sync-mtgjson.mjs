// MTGJSON → Postgres ingest, adapted from the user's Rails rake task.
//
// Pulls MTGJSON's CSV files and upserts the full printing-level dataset
// (sets, cards, identifiers, legalities, rulings) into Postgres. Cards are
// keyed by MTGJSON uuid; identifiers carry scryfallId so the app (Scryfall-id
// native) can join onto it.
//
// Usage:  node scripts/sync-mtgjson.mjs            (full sync)
//         MAX=2000 node scripts/sync-mtgjson.mjs   (cap rows/table for testing)
//
// Reads DATABASE_URL from the environment or .env.local.

import { readFileSync } from "node:fs";
import pg from "pg";

const BASE = "https://mtgjson.com/api/v5/csv";
const BATCH = 1000;
const MAX = process.env.MAX ? parseInt(process.env.MAX, 10) : Infinity;

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const m = env.match(/^DATABASE_URL=(.*)$/m);
    if (m) return m[1].trim();
  } catch {
    /* ignore */
  }
  return "postgres://postgres:postgres@localhost:5432/edh_playtest";
}

// --- RFC-4180 CSV row generator (quote/newline aware) ------------------------
function* csvRows(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let field = "";
  let row = [];
  let inQuotes = false;
  let header = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\r") { /* skip */ }
    else if (ch === "\n") {
      row.push(field); field = "";
      if (header === null) header = row;
      else { const o = {}; for (let k = 0; k < header.length; k++) o[header[k]] = row[k] ?? ""; yield o; }
      row = [];
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    if (header && row.some((c) => c !== "")) { const o = {}; for (let k = 0; k < header.length; k++) o[header[k]] = row[k] ?? ""; yield o; }
  }
}

async function fetchCsv(name) {
  process.stdout.write(`  fetching ${name}.csv … `);
  const res = await fetch(`${BASE}/${name}.csv`);
  if (!res.ok) throw new Error(`${name}.csv ${res.status}`);
  const text = await res.text();
  console.log(`${(text.length / 1024 / 1024).toFixed(0)}MB`);
  return text;
}

const arr = (s) => (s ? s.split(",").map((x) => x.trim()) : null);
const bool = (s) => s === "1" || s === "true";
const num = (s) => (s === "" || s == null ? null : Number(s));

// --- generic batched upsert --------------------------------------------------
async function upsert(client, table, cols, conflictCol, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const ph = slice
      .map((_, r) => `(${cols.map((__, c) => `$${r * cols.length + c + 1}`).join(",")})`)
      .join(",");
    const params = slice.flatMap((row) => cols.map((c) => row[c]));
    const updates = cols.filter((c) => c !== conflictCol).map((c) => `${c}=excluded.${c}`).join(",");
    await client.query(
      `insert into ${table} (${cols.join(",")}) values ${ph}
       on conflict (${conflictCol}) do update set ${updates}`,
      params,
    );
  }
}

async function ensureSchema(client) {
  await client.query(`
    create table if not exists mtg_sets (
      code text primary key, name text, release_date text, set_type text,
      base_set_size int, total_set_size int, keyrune_code text, parent_code text,
      tcgplayer_group_id text, is_online_only boolean, is_foil_only boolean
    );
    create table if not exists mtg_cards (
      uuid text primary key, name text, face_name text, side text,
      set_code text, number text, rarity text, type text, text text,
      mana_cost text, mana_value real, colors text[], color_identity text[],
      power text, toughness text, loyalty text, layout text,
      keywords text[], finishes text[], other_face_ids text[],
      has_foil boolean, has_non_foil boolean, is_promo boolean,
      is_reprint boolean, is_funny boolean, edhrec_rank int
    );
    create index if not exists mtg_cards_set_idx on mtg_cards(set_code);
    create index if not exists mtg_cards_name_idx on mtg_cards(lower(name));
    create table if not exists mtg_identifiers (
      uuid text primary key, scryfall_id text, scryfall_oracle_id text,
      scryfall_illustration_id text, tcgplayer_product_id text,
      tcgplayer_etched_product_id text, card_kingdom_id text,
      card_kingdom_foil_id text, multiverse_id text
    );
    create index if not exists mtg_identifiers_scry_idx on mtg_identifiers(scryfall_id);
    create index if not exists mtg_identifiers_oracle_idx on mtg_identifiers(scryfall_oracle_id);
    create table if not exists mtg_legalities (
      uuid text primary key, commander text, duel text, legacy text, modern text,
      oathbreaker text, pauper text, paupercommander text, penny text,
      pioneer text, predh text, premodern text, standard text, vintage text, brawl text
    );
    create table if not exists mtg_rulings (
      id bigserial primary key, uuid text, date text, text text
    );
    create index if not exists mtg_rulings_uuid_idx on mtg_rulings(uuid);
  `);
}

async function ingestSets(client) {
  const rows = [];
  for (const s of csvRows(await fetchCsv("sets"))) {
    if (bool(s.isPartialPreview)) continue;
    rows.push({
      code: s.code, name: s.name, release_date: s.releaseDate, set_type: s.type,
      base_set_size: num(s.baseSetSize), total_set_size: num(s.totalSetSize),
      keyrune_code: s.keyruneCode, parent_code: s.parentCode || null,
      tcgplayer_group_id: s.tcgplayerGroupId || null,
      is_online_only: bool(s.isOnlineOnly), is_foil_only: bool(s.isFoilOnly),
    });
    if (rows.length >= MAX) break;
  }
  await upsert(client, "mtg_sets",
    ["code","name","release_date","set_type","base_set_size","total_set_size","keyrune_code","parent_code","tcgplayer_group_id","is_online_only","is_foil_only"],
    "code", rows);
  console.log(`  → ${rows.length} sets`);
}

async function ingestIdentifiers(client) {
  const rows = [];
  for (const x of csvRows(await fetchCsv("cardIdentifiers"))) {
    rows.push({
      uuid: x.uuid, scryfall_id: x.scryfallId || null, scryfall_oracle_id: x.scryfallOracleId || null,
      scryfall_illustration_id: x.scryfallIllustrationId || null,
      tcgplayer_product_id: x.tcgplayerProductId || null,
      tcgplayer_etched_product_id: x.tcgplayerEtchedProductId || null,
      card_kingdom_id: x.cardKingdomId || null, card_kingdom_foil_id: x.cardKingdomFoilId || null,
      multiverse_id: x.multiverseId || null,
    });
    if (rows.length >= MAX) break;
  }
  await upsert(client, "mtg_identifiers",
    ["uuid","scryfall_id","scryfall_oracle_id","scryfall_illustration_id","tcgplayer_product_id","tcgplayer_etched_product_id","card_kingdom_id","card_kingdom_foil_id","multiverse_id"],
    "uuid", rows);
  console.log(`  → ${rows.length} identifiers`);
}

async function ingestLegalities(client) {
  const rows = [];
  for (const l of csvRows(await fetchCsv("cardLegalities"))) {
    rows.push({
      uuid: l.uuid, commander: l.commander, duel: l.duel, legacy: l.legacy, modern: l.modern,
      oathbreaker: l.oathbreaker, pauper: l.pauper, paupercommander: l.paupercommander, penny: l.penny,
      pioneer: l.pioneer, predh: l.predh, premodern: l.premodern, standard: l.standard, vintage: l.vintage, brawl: l.brawl,
    });
    if (rows.length >= MAX) break;
  }
  await upsert(client, "mtg_legalities",
    ["uuid","commander","duel","legacy","modern","oathbreaker","pauper","paupercommander","penny","pioneer","predh","premodern","standard","vintage","brawl"],
    "uuid", rows);
  console.log(`  → ${rows.length} legalities`);
}

async function ingestRulings(client) {
  const text = await fetchCsv("cardRulings");
  await client.query("truncate mtg_rulings");
  let batch = [];
  let total = 0;
  const flush = async () => {
    if (!batch.length) return;
    const ph = batch.map((_, r) => `($${r * 3 + 1},$${r * 3 + 2},$${r * 3 + 3})`).join(",");
    const params = batch.flatMap((x) => [x.uuid, x.date, x.text]);
    await client.query(`insert into mtg_rulings (uuid,date,text) values ${ph}`, params);
    total += batch.length;
    batch = [];
  };
  for (const r of csvRows(text)) {
    batch.push({ uuid: r.uuid, date: r.date, text: r.text });
    if (batch.length >= BATCH) await flush();
    if (total + batch.length >= MAX) break;
  }
  await flush();
  console.log(`  → ${total} rulings`);
}

async function ingestCards(client) {
  const text = await fetchCsv("cards");
  const cols = ["uuid","name","face_name","side","set_code","number","rarity","type","text","mana_cost","mana_value","colors","color_identity","power","toughness","loyalty","layout","keywords","finishes","other_face_ids","has_foil","has_non_foil","is_promo","is_reprint","is_funny","edhrec_rank"];
  let batch = [];
  let total = 0;
  const flush = async () => {
    if (!batch.length) return;
    await upsert(client, "mtg_cards", cols, "uuid", batch);
    total += batch.length;
    batch = [];
    process.stdout.write(`\r  → ${total} cards`);
  };
  for (const c of csvRows(text)) {
    batch.push({
      uuid: c.uuid, name: c.name, face_name: c.faceName || null, side: c.side || null,
      set_code: c.setCode, number: c.number, rarity: c.rarity, type: c.type, text: c.text || null,
      mana_cost: c.manaCost || null, mana_value: num(c.manaValue),
      colors: arr(c.colors), color_identity: arr(c.colorIdentity),
      power: c.power || null, toughness: c.toughness || null, loyalty: c.loyalty || null,
      layout: c.layout, keywords: arr(c.keywords), finishes: arr(c.finishes),
      other_face_ids: arr(c.otherFaceIds), has_foil: bool(c.hasFoil), has_non_foil: bool(c.hasNonFoil),
      is_promo: bool(c.isPromo), is_reprint: bool(c.isReprint), is_funny: bool(c.isFunny),
      edhrec_rank: num(c.edhrecRank),
    });
    if (batch.length >= BATCH) await flush();
    if (total + batch.length >= MAX) break;
  }
  await flush();
  console.log();
}

async function main() {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const t0 = Date.now();
  console.log(MAX === Infinity ? "Full MTGJSON sync →" : `MTGJSON sync (MAX=${MAX}) →`);
  await ensureSchema(client);
  await ingestSets(client);
  await ingestIdentifiers(client);
  await ingestLegalities(client);
  await ingestRulings(client);
  await ingestCards(client);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
