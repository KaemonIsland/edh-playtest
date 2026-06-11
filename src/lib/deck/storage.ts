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

const BOT_KEY = "edh-playtest:bot-decks";

export function saveBotDecks(decks: Deck[]): void {
  try {
    if (decks.length > 0) window.localStorage.setItem(BOT_KEY, JSON.stringify(decks));
    else window.localStorage.removeItem(BOT_KEY);
  } catch {
    // quota exceeded — non-fatal
  }
}

export function loadBotDecksFromStorage(): Deck[] {
  try {
    const raw = window.localStorage.getItem(BOT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Deck | Deck[]) : [];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}
