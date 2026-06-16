import { NextRequest, NextResponse } from "next/server";
import { randomCard } from "@/lib/scryfall/server";

export const dynamic = "force-dynamic";

/** GET ?q=is:commander -> { card } — a random card matching the query. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "is:commander";
  try {
    const card = await randomCard(q);
    if (!card) return NextResponse.json({ error: "no card" }, { status: 404 });
    return NextResponse.json({ card });
  } catch (err) {
    console.error("Scryfall random failed", err);
    return NextResponse.json({ error: "Scryfall request failed" }, { status: 502 });
  }
}
