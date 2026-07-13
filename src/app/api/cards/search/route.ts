import { NextRequest, NextResponse } from "next/server";
import { searchCardsByName } from "@/lib/scryfall/server";

export const dynamic = "force-dynamic";

/**
 * GET ?q=query[&limit=n] — Scryfall search proxy. Used as the fallback when
 * the local DB isn't synced, and always for Scryfall-syntax queries (otag:,
 * id<=…), which the local name index can't answer.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  try {
    const cards = await searchCardsByName(q, Number.isFinite(limit) ? limit : 30);
    return NextResponse.json({ cards });
  } catch (err) {
    console.error("Scryfall search failed", err);
    return NextResponse.json({ error: "Scryfall request failed" }, { status: 502 });
  }
}
