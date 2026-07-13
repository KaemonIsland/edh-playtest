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

/** One suggestion from a commander page, with EDHREC's own metrics. */
export interface EdhrecSuggestion {
  name: string;
  /** Which cardlist it came from ("High Synergy Cards", "Instants"…). */
  header: string;
  /** Synergy: inclusion with this commander minus baseline inclusion. High
   * synergy = commander-specific tech, not a generic staple. */
  synergy?: number;
  numDecks?: number;
  potentialDecks?: number;
}

/** Shape 2's cardlists, with per-card synergy/inclusion metrics kept. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSuggestions(json: any): EdhrecSuggestion[] {
  const cardlists = json?.container?.json_dict?.cardlists;
  if (!Array.isArray(cardlists)) return [];
  const out: EdhrecSuggestion[] = [];
  for (const list of cardlists) {
    const header = typeof list?.header === "string" ? list.header : "";
    for (const cv of list?.cardviews ?? []) {
      if (typeof cv?.name !== "string") continue;
      out.push({
        name: cv.name,
        header,
        synergy: typeof cv.synergy === "number" ? cv.synergy : undefined,
        numDecks: typeof cv.num_decks === "number" ? cv.num_decks : undefined,
        potentialDecks: typeof cv.potential_decks === "number" ? cv.potential_decks : undefined,
      });
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const commander = req.nextUrl.searchParams.get("commander")?.trim();
  if (!commander) {
    return NextResponse.json({ error: "missing commander" }, { status: 400 });
  }
  const slug = slugifyCommander(commander);
  const mode = req.nextUrl.searchParams.get("mode");
  const headers = {
    "User-Agent": "GlitchedGobletPlaytester/0.1",
    Accept: "application/json",
  };

  // mode=cards: structured suggestions (name + synergy/inclusion) from the
  // commander page — used by the builder's Suggestions modal.
  if (mode === "cards") {
    try {
      const res = await fetch(`https://json.edhrec.com/pages/commanders/${slug}.json`, {
        headers,
        next: { revalidate: 86400 },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `No EDHREC page for "${commander}".` },
          { status: 404 },
        );
      }
      const cards = extractSuggestions(await res.json());
      if (cards.length === 0) {
        return NextResponse.json(
          { error: `No suggestions found for "${commander}".` },
          { status: 404 },
        );
      }
      return NextResponse.json({ commanderName: commander, slug, cards });
    } catch (err) {
      console.error("EDHREC fetch failed", err);
      return NextResponse.json({ error: "EDHREC request failed" }, { status: 502 });
    }
  }

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
