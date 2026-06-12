import { NextRequest, NextResponse } from "next/server";
import { searchPrintings } from "@/lib/scryfall/server";

export const dynamic = "force-dynamic";

/** GET ?oracle=<oracle_id> — all printings of a card (variation picker). */
export async function GET(req: NextRequest) {
  const oracle = req.nextUrl.searchParams.get("oracle")?.trim();
  if (!oracle) return NextResponse.json({ error: "missing oracle" }, { status: 400 });
  try {
    const cards = await searchPrintings(oracle);
    return NextResponse.json({ cards });
  } catch (err) {
    console.error("Scryfall prints failed", err);
    return NextResponse.json({ error: "Scryfall request failed" }, { status: 502 });
  }
}
