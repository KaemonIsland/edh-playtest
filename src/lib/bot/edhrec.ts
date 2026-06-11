"use client";

import { db, EDHREC_CACHE_TTL_MS } from "@/lib/db";
import { slugifyCommander } from "./slug";

export interface EdhrecResult {
  commanderName: string;
  lines: string[];
  fromCache: boolean;
}

/**
 * Fetch a commander's average decklist (best-effort community data).
 * Cached aggressively in IndexedDB; returns null on any failure so callers
 * can fall back to the bundled decks.
 */
export async function fetchAverageDeck(commanderName: string): Promise<EdhrecResult | null> {
  const slug = slugifyCommander(commanderName);
  if (!slug) return null;

  try {
    const cached = await db.edhrecDecks.get(slug);
    if (cached && Date.now() - cached.fetchedAt < EDHREC_CACHE_TTL_MS) {
      return { commanderName: cached.commanderName, lines: cached.lines, fromCache: true };
    }
  } catch {
    // cache failure is non-fatal
  }

  try {
    const res = await fetch(`/api/edhrec?commander=${encodeURIComponent(commanderName)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { commanderName: string; lines: string[] };
    if (!Array.isArray(data.lines) || data.lines.length < 50) return null;
    await db.edhrecDecks
      .put({ slug, commanderName: data.commanderName, lines: data.lines, fetchedAt: Date.now() })
      .catch(() => {});
    return { commanderName: data.commanderName, lines: data.lines, fromCache: false };
  } catch {
    return null;
  }
}
