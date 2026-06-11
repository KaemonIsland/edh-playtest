"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGameStore } from "@/lib/game/store";
import { loadBotDecksFromStorage, loadCurrentDeck } from "@/lib/deck/storage";
import { PlaytesterRoot } from "@/components/playtester/PlaytesterRoot";

export default function PlayPage() {
  const deck = useGameStore((s) => s.deck);
  const started = useGameStore((s) => s.started);
  const loadDeck = useGameStore((s) => s.loadDeck);
  const startGame = useGameStore((s) => s.startGame);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const state = useGameStore.getState();
    if (!state.deck) {
      const saved = loadCurrentDeck();
      if (saved) loadDeck(saved);
      const savedBots = loadBotDecksFromStorage();
      if (savedBots.length > 0) useGameStore.getState().loadBotDecks(savedBots);
    }
    if (useGameStore.getState().deck && !useGameStore.getState().started) {
      startGame();
    }
    setReady(true);
  }, [loadDeck, startGame]);

  if (!ready) return null;

  if (!deck) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-[#08080a] text-stone-300">
        <p className="text-sm">No deck loaded yet.</p>
        <Link
          href="/"
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600"
        >
          Import a deck
        </Link>
      </div>
    );
  }

  if (!started) return null;
  return <PlaytesterRoot />;
}
