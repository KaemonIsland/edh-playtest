import { NextRequest, NextResponse } from "next/server";
import { searchCardsByName } from "@/lib/scryfall/server";

export const dynamic = "force-dynamic";

/** GET ?q=name — fallback card search when the local DB isn't synced. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });
  try {
    const cards = await searchCardsByName(q);
    return NextResponse.json({ cards });
  } catch (err) {
    console.error("Scryfall search failed", err);
    return NextResponse.json({ error: "Scryfall request failed" }, { status: 502 });
  }
}
