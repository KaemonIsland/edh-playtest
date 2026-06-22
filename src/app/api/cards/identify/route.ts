import { NextRequest, NextResponse } from "next/server";
import { resolveIdentifiers, type CardIdentifier } from "@/lib/scryfall/server";

export const dynamic = "force-dynamic";

/**
 * POST { identifiers: CardIdentifier[] } (<=75) -> { cards }.
 * Resolves cards by id, name, set+collector number, or name+set.
 */
export async function POST(req: NextRequest) {
  let identifiers: CardIdentifier[];
  try {
    ({ identifiers } = (await req.json()) as { identifiers: CardIdentifier[] });
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(identifiers)) {
    return NextResponse.json({ error: "identifiers must be an array" }, { status: 400 });
  }
  if (identifiers.length > 75) {
    return NextResponse.json({ error: "max 75 identifiers per request" }, { status: 400 });
  }
  try {
    return NextResponse.json(await resolveIdentifiers(identifiers));
  } catch (err) {
    console.error("identify failed", err);
    return NextResponse.json({ error: "Scryfall request failed" }, { status: 502 });
  }
}
