import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Build the TCGplayer + Card Kingdom price index from MTGJSON, keyed by
 * Scryfall id so the client can join it onto its Scryfall-keyed cards.
 *
 * Two small inputs (no 600MB AllPrintings needed):
 *  - cardIdentifiers.csv (~31MB): uuid → scryfallId bridge.
 *  - AllPricesToday.json.gz (~5MB): retail prices keyed by MTGJSON uuid.
 *
 * Returns { date, rows: { id, tcg?, tcgFoil?, ck?, ckFoil? }[] } where `id` is
 * the Scryfall printing id and prices are USD retail.
 */

const BRIDGE_URL = "https://mtgjson.com/api/v5/csv/cardIdentifiers.csv";
const PRICES_URL = "https://mtgjson.com/api/v5/AllPricesToday.json.gz";

interface PriceRow {
  id: string;
  tcg?: number;
  tcgFoil?: number;
  ck?: number;
  ckFoil?: number;
}

type DateMap = Record<string, number>;
interface Retail {
  retail?: { normal?: DateMap; foil?: DateMap };
  currency?: string;
}
interface PriceEntry {
  paper?: { tcgplayer?: Retail; cardkingdom?: Retail };
}

/** Latest-dated value in a {date: price} map. */
function latest(m?: DateMap): number | undefined {
  if (!m) return undefined;
  let bestDate = "";
  let best: number | undefined;
  for (const [d, v] of Object.entries(m)) {
    if (d > bestDate) {
      bestDate = d;
      best = v;
    }
  }
  return best;
}

/** uuid → scryfallId from the CSV (columns 0 and 1). Parsed by hand to avoid
 * loading 90k split arrays — uuid/scryfallId never contain commas. */
async function fetchBridge(): Promise<Map<string, string>> {
  const res = await fetch(BRIDGE_URL);
  if (!res.ok) throw new Error(`cardIdentifiers.csv ${res.status}`);
  const text = await res.text();
  const bridge = new Map<string, string>();
  let nl = text.indexOf("\n"); // skip header
  let start = nl + 1;
  while (start < text.length) {
    nl = text.indexOf("\n", start);
    const end = nl === -1 ? text.length : nl;
    const c1 = text.indexOf(",", start);
    if (c1 !== -1 && c1 < end) {
      const c2 = text.indexOf(",", c1 + 1);
      const scryfallId = text.slice(c1 + 1, c2 === -1 || c2 > end ? end : c2);
      if (scryfallId) bridge.set(text.slice(start, c1), scryfallId);
    }
    if (nl === -1) break;
    start = nl + 1;
  }
  return bridge;
}

async function fetchPrices(): Promise<{ date: string; data: Record<string, PriceEntry> }> {
  const res = await fetch(PRICES_URL);
  if (!res.ok) throw new Error(`AllPricesToday.json.gz ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const json = gunzipSync(buf).toString("utf8");
  const parsed = JSON.parse(json) as { meta?: { date?: string }; data: Record<string, PriceEntry> };
  return { date: parsed.meta?.date ?? "", data: parsed.data };
}

export async function POST() {
  try {
    const [bridge, prices] = await Promise.all([fetchBridge(), fetchPrices()]);

    // Merge by scryfallId — MTGJSON may have separate uuids (foil/nonfoil
    // versions) that share one Scryfall printing; first non-empty value wins.
    const rows = new Map<string, PriceRow>();
    for (const [uuid, entry] of Object.entries(prices.data)) {
      const scryfallId = bridge.get(uuid);
      if (!scryfallId) continue;
      const tcg = entry.paper?.tcgplayer?.retail;
      const ck = entry.paper?.cardkingdom?.retail;
      const vals = {
        tcg: latest(tcg?.normal),
        tcgFoil: latest(tcg?.foil),
        ck: latest(ck?.normal),
        ckFoil: latest(ck?.foil),
      };
      if (vals.tcg == null && vals.tcgFoil == null && vals.ck == null && vals.ckFoil == null) continue;
      const row = rows.get(scryfallId) ?? { id: scryfallId };
      row.tcg ??= vals.tcg;
      row.tcgFoil ??= vals.tcgFoil;
      row.ck ??= vals.ck;
      row.ckFoil ??= vals.ckFoil;
      rows.set(scryfallId, row);
    }

    return NextResponse.json({ date: prices.date, rows: [...rows.values()] });
  } catch (err) {
    console.error("MTGJSON price sync failed", err);
    return NextResponse.json({ error: "MTGJSON price sync failed" }, { status: 502 });
  }
}
