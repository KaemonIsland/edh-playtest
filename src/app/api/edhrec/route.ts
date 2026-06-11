import { NextRequest, NextResponse } from "next/server";
import { slugifyCommander } from "@/lib/bot/slug";

/**
 * Best-effort proxy for EDHREC's unofficial json backend (community data, no
 * key). Routed through the server to avoid CORS and send a proper User-Agent.
 * GET ?commander=Name -> { commanderName, lines: ["1 Card Name", ...] }
 */

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLines(json: any): string[] {
  // Shape 1: average-decks pages carry a flat `deck` array of card names
  // (basics repeated), sometimes already prefixed with quantities.
  if (Array.isArray(json?.deck) && json.deck.length > 0) {
    const counts = new Map<string, number>();
    for (const entry of json.deck) {
      if (typeof entry !== "string") continue;
      const m = entry.match(/^(\d+)\s+(.*)$/);
      const [qty, name] = m ? [parseInt(m[1]!, 10), m[2]!] : [1, entry];
      counts.set(name, (counts.get(name) ?? 0) + qty);
    }
    return [...counts.entries()].map(([name, qty]) => `${qty} ${name}`);
  }
  // Shape 2: commander pages list cardlists of cardviews.
  const cardlists = json?.container?.json_dict?.cardlists;
  if (Array.isArray(cardlists)) {
    const lines: string[] = [];
    for (const list of cardlists) {
      for (const cv of list?.cardviews ?? []) {
        if (typeof cv?.name === "string") lines.push(`1 ${cv.name}`);
      }
    }
    return lines;
  }
  return [];
}

export async function GET(req: NextRequest) {
  const commander = req.nextUrl.searchParams.get("commander")?.trim();
  if (!commander) {
    return NextResponse.json({ error: "missing commander" }, { status: 400 });
  }
  const slug = slugifyCommander(commander);
  const headers = {
    "User-Agent": "GlitchedGobletPlaytester/0.1",
    Accept: "application/json",
  };

  try {
    for (const path of [`average-decks/${slug}`, `commanders/${slug}`]) {
      const res = await fetch(`https://json.edhrec.com/pages/${path}.json`, {
        headers,
        // EDHREC data changes slowly; let Next cache server-side for a day.
        next: { revalidate: 86400 },
      });
      if (!res.ok) continue;
      const lines = extractLines(await res.json());
      if (lines.length >= 50) {
        return NextResponse.json({ commanderName: commander, slug, lines });
      }
    }
    return NextResponse.json(
      { error: `No average deck found for "${commander}" on EDHREC.` },
      { status: 404 },
    );
  } catch (err) {
    console.error("EDHREC fetch failed", err);
    return NextResponse.json({ error: "EDHREC request failed" }, { status: 502 });
  }
}
