import { NextRequest, NextResponse } from "next/server";
import { searchTokens } from "@/lib/scryfall/server";

export const dynamic = "force-dynamic";

/** GET ?q=goblin -> { cards: ScryCard[] } — token search for the token modal. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "missing q" }, { status: 400 });
  }
  try {
    const cards = await searchTokens(q);
    return NextResponse.json({ cards });
  } catch (err) {
    console.error("Scryfall token search failed", err);
    return NextResponse.json({ error: "Scryfall request failed" }, { status: 502 });
  }
}
