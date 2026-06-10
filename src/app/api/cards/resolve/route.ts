import { NextRequest, NextResponse } from "next/server";
import { resolveCardNames } from "@/lib/scryfall/server";

export const dynamic = "force-dynamic";

/**
 * POST { names: string[] } -> { cards: ScryCard[], notFound: string[] }
 * Server route so Scryfall sees a proper User-Agent and we stay rate-limited.
 */
export async function POST(req: NextRequest) {
  let names: unknown;
  try {
    ({ names } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) {
    return NextResponse.json({ error: "names must be a string[]" }, { status: 400 });
  }
  if (names.length === 0) {
    return NextResponse.json({ cards: [], notFound: [] });
  }
  if (names.length > 500) {
    return NextResponse.json({ error: "too many names (max 500)" }, { status: 400 });
  }

  try {
    const result = await resolveCardNames(names as string[]);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Scryfall resolve failed", err);
    return NextResponse.json({ error: "Scryfall request failed" }, { status: 502 });
  }
}
