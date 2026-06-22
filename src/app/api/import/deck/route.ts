import { NextRequest, NextResponse } from "next/server";
import { fetchDeckFromUrl } from "@/lib/integrations/decks";

export const dynamic = "force-dynamic";

/** GET ?url=<archidekt|moxfield deck url> -> normalized ImportedDeck. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")?.trim();
  if (!url) return NextResponse.json({ error: "missing url" }, { status: 400 });
  try {
    const deck = await fetchDeckFromUrl(url);
    return NextResponse.json({ deck });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch deck." },
      { status: 502 },
    );
  }
}
