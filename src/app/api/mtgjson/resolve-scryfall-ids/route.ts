import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/repo/pg";

export const dynamic = "force-dynamic";

/**
 * Reverse of resolve-uuids: map Scryfall printing ids → MTGJSON uuids using the
 * locally-synced `mtg_identifiers` table. Lets the collection export stamp each
 * row with its MTGJSON UUID (the most precise re-import key), offline.
 *
 * A Scryfall printing can have multiple MTGJSON uuids (foil/nonfoil variants);
 * we return one representative (front face, non-funny) per id — enough to
 * re-resolve the printing, with the export's Foil column carrying the finish.
 *
 * POST { scryfallIds: string[] } -> { map: Record<scryfallId, uuid> }
 */
export async function POST(req: NextRequest) {
  let scryfallIds: string[];
  try {
    ({ scryfallIds } = (await req.json()) as { scryfallIds: string[] });
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(scryfallIds) || scryfallIds.length === 0) {
    return NextResponse.json({ map: {} });
  }
  try {
    const rows = await query<{ scryfall_id: string; uuid: string }>(
      `select distinct on (i.scryfall_id) i.scryfall_id, i.uuid
       from mtg_identifiers i
       join mtg_cards c on c.uuid = i.uuid
       where i.scryfall_id = any($1)
         and (c.side is null or c.side = '' or c.side = 'a')
       order by i.scryfall_id, c.is_funny asc nulls last`,
      [[...new Set(scryfallIds.filter(Boolean))]],
    );
    const map: Record<string, string> = {};
    for (const r of rows) map[r.scryfall_id] = r.uuid;
    return NextResponse.json({ map });
  } catch (err) {
    // Tables may not exist yet (MTGJSON unsynced) — degrade gracefully.
    console.error("resolve-scryfall-ids failed", err);
    return NextResponse.json({ map: {} });
  }
}
