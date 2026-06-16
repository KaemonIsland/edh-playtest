import { NextRequest, NextResponse } from "next/server";
import { resolveCardsByIds } from "@/lib/scryfall/server";

export const dynamic = "force-dynamic";

/** POST { ids: string[] } (<=75) -> { cards, notFound } — resolve printings by id. */
export async function POST(req: NextRequest) {
  let ids: unknown;
  try {
    ({ ids } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) {
    return NextResponse.json({ error: "ids must be a string[]" }, { status: 400 });
  }
  if (ids.length > 75) {
    return NextResponse.json({ error: "max 75 ids per request" }, { status: 400 });
  }
  try {
    const result = await resolveCardsByIds(ids as string[]);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Scryfall by-ids failed", err);
    return NextResponse.json({ error: "Scryfall request failed" }, { status: 502 });
  }
}
