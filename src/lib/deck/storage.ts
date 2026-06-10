"use client";

import type { Deck } from "@/types";

const KEY = "edh-playtest:current-deck";

/** Persist the active deck across refreshes (localStorage; ~400KB per deck). */
export function saveCurrentDeck(deck: Deck): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(deck));
  } catch {
    // quota exceeded — playtest still works for this session
  }
}

export function loadCurrentDeck(): Deck | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Deck) : null;
  } catch {
    return null;
  }
}
