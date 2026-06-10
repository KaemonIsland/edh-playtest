import type { ScryCard } from "@/types";
import { cacheCards, getCachedCards } from "@/lib/db";

export interface ResolveProgress {
  total: number;
  resolved: number;
  fromCache: number;
  phase: "cache" | "fetch" | "done";
}

export interface ClientResolveResult {
  /** Resolved cards keyed by the requested (raw) name. */
  byName: Map<string, ScryCard>;
  notFound: string[];
}

/**
 * Resolve card names cache-first: IndexedDB (fresh <24h) -> /api/cards/resolve.
 * Never re-fetches a known card; everything fetched is written back to the cache.
 */
export async function resolveCards(
  names: string[],
  onProgress?: (p: ResolveProgress) => void,
): Promise<ClientResolveResult> {
  const unique = [...new Set(names)];
  const { found, missing } = await getCachedCards(unique);
  onProgress?.({
    total: unique.length,
    resolved: found.size,
    fromCache: found.size,
    phase: missing.length ? "fetch" : "done",
  });

  const byName = new Map(found);
  const notFound: string[] = [];

  if (missing.length > 0) {
    const res = await fetch("/api/cards/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: missing }),
    });
    if (!res.ok) {
      throw new Error(`Card resolution failed (${res.status})`);
    }
    const data = (await res.json()) as { cards: ScryCard[]; notFound: string[] };
    await cacheCards(data.cards);

    // Map fetched cards back to the names that requested them.
    const fetchedByKey = new Map(data.cards.map((c) => [normKey(c.name), c]));
    for (const name of missing) {
      const hit =
        fetchedByKey.get(normKey(name)) ??
        // fuzzy fallback may have returned a differently-spelled name; match loosely
        data.cards.find((c) => normKey(c.name).startsWith(normKey(name)));
      if (hit) byName.set(name, hit);
      else notFound.push(name);
    }
  }

  onProgress?.({
    total: unique.length,
    resolved: byName.size,
    fromCache: found.size,
    phase: "done",
  });
  return { byName, notFound };
}

function normKey(name: string): string {
  return name.trim().toLowerCase().split("//")[0]!.trim();
}

/** Resolve a single name (used by the unresolved-name fix-up step). */
export async function resolveOne(name: string): Promise<ScryCard | null> {
  const result = await resolveCards([name]);
  return result.byName.get(name) ?? null;
}

export async function searchTokensClient(query: string): Promise<ScryCard[]> {
  const res = await fetch(`/api/cards/token?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { cards: ScryCard[] };
  return data.cards;
}
