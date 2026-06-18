import { NextResponse } from "next/server";
import { fetchSets } from "@/lib/scryfall/server";

export const dynamic = "force-dynamic";

/** GET -> { sets } — all paper Magic sets, newest first. */
export async function GET() {
  try {
    const sets = await fetchSets();
    return NextResponse.json({ sets });
  } catch (err) {
    console.error("Scryfall sets failed", err);
    return NextResponse.json({ error: "Scryfall request failed" }, { status: 502 });
  }
}
