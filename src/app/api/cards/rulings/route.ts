import { NextRequest, NextResponse } from "next/server";
import { fetchRulings } from "@/lib/scryfall/server";

export const dynamic = "force-dynamic";

/** GET ?id=<scryfall card id> — official rulings for the card. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  try {
    const rulings = await fetchRulings(id);
    return NextResponse.json({ rulings });
  } catch (err) {
    console.error("Scryfall rulings failed", err);
    return NextResponse.json({ error: "Scryfall request failed" }, { status: 502 });
  }
}
