import { NextRequest, NextResponse } from "next/server";
import { fetchSetCards } from "@/lib/scryfall/server";

export const dynamic = "force-dynamic";

/** GET ?code=mh3 -> { cards } — every printing in a set, by collector number. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });
  try {
    const cards = await fetchSetCards(code);
    return NextResponse.json({ cards });
  } catch (err) {
    console.error("Scryfall set cards failed", err);
    return NextResponse.json({ error: "Scryfall request failed" }, { status: 502 });
  }
}
