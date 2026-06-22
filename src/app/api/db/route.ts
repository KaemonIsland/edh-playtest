import { NextRequest, NextResponse } from "next/server";
import { pgRepo } from "@/lib/repo/pgRepo";

export const dynamic = "force-dynamic";

/** Repo operations callable over RPC. Allowlisted so the route can't invoke
 * arbitrary methods. */
const OPS = new Set([
  "listDecks",
  "getDeck",
  "saveDeck",
  "deleteDeck",
  "getPrimer",
  "savePrimer",
  "listVersions",
  "addVersion",
  "deleteVersion",
  "listGames",
  "addGame",
  "deleteGame",
  "listComments",
  "addComment",
  "deleteComment",
  "listCollection",
  "getCollectionEntry",
  "getCollectionByOracle",
  "ownedOracleIds",
  "saveCollectionEntry",
  "saveCollectionEntries",
  "removeCollectionEntry",
  "clearCollection",
  "listWishlist",
  "getWishlistEntry",
  "saveWishlistEntry",
  "removeWishlistEntry",
]);

/**
 * POST { op: string, args: unknown[] } -> { result } | { error }.
 * Single dispatcher for the whole Repo interface against local Postgres.
 */
export async function POST(req: NextRequest) {
  let op: string;
  let args: unknown[];
  try {
    const body = (await req.json()) as { op: string; args?: unknown[] };
    op = body.op;
    args = body.args ?? [];
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!OPS.has(op)) {
    return NextResponse.json({ error: `unknown op: ${op}` }, { status: 400 });
  }
  try {
    // ownedOracleIds returns a Set — serialize as an array for transport.
    const fn = (pgRepo as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[op]!;
    const result = await fn.apply(pgRepo, args);
    if (result instanceof Set) {
      return NextResponse.json({ result: [...result] });
    }
    return NextResponse.json({ result: result ?? null });
  } catch (err) {
    console.error(`/api/db ${op} failed`, err);
    const message =
      err instanceof Error && /ECONNREFUSED|ENOTFOUND|password|database .* does not exist/i.test(err.message)
        ? "Can't reach the local Postgres database. Is it running, and is DATABASE_URL set? See README."
        : "Database operation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
