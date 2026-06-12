"use client";

import { useState } from "react";
import type { ScryCard } from "@/types";
import { PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { searchTokensClient } from "@/lib/scryfall/resolve";
import { CardImage } from "@/components/cards/CardImage";
import { Modal } from "./Modal";

const COLORS = ["W", "U", "B", "R", "G"] as const;

export function TokenModal({ playerId = PLAYER_ID }: { playerId?: string }) {
  const g = useGameStore();
  const createToken = (spec: Parameters<typeof g.createToken>[0], count?: number) =>
    g.createToken(spec, count, playerId);
  const createTokenFromCard = (card: ScryCard, count?: number) =>
    g.createTokenFromCard(card, count, playerId);
  const targetName =
    playerId === PLAYER_ID ? null : (g.players[playerId]?.name ?? "Opponent");
  const closeModal = useUiStore((s) => s.closeModal);

  const [tab, setTab] = useState<"custom" | "scryfall">("custom");

  // custom token form
  const [name, setName] = useState("");
  const [typeLine, setTypeLine] = useState("Token Creature");
  const [power, setPower] = useState("1");
  const [toughness, setToughness] = useState("1");
  const [colors, setColors] = useState<string[]>([]);
  const [count, setCount] = useState(1);

  // scryfall search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScryCard[]>([]);
  const [searching, setSearching] = useState(false);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setResults(await searchTokensClient(query.trim()));
    } finally {
      setSearching(false);
    }
  };

  return (
    <Modal title={targetName ? `Create token — ${targetName}'s field` : "Create token"} wide>
      <div className="mb-4 flex gap-1 rounded-lg bg-stone-900 p-1">
        {(["custom", "scryfall"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === t ? "bg-stone-700 text-white" : "text-stone-400 hover:text-stone-200"
            }`}
          >
            {t === "custom" ? "Custom token" : "Search Scryfall"}
          </button>
        ))}
      </div>

      {tab === "custom" ? (
        <div className="flex flex-col gap-3">
          <Field label="Name">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Goblin"
              className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm text-stone-200 outline-none focus:border-emerald-600"
            />
          </Field>
          <Field label="Type line">
            <input
              value={typeLine}
              onChange={(e) => setTypeLine(e.target.value)}
              className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm text-stone-200 outline-none focus:border-emerald-600"
            />
          </Field>
          <div className="flex gap-3">
            <Field label="Power">
              <input
                value={power}
                onChange={(e) => setPower(e.target.value)}
                className="w-16 rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm text-stone-200 outline-none focus:border-emerald-600"
              />
            </Field>
            <Field label="Toughness">
              <input
                value={toughness}
                onChange={(e) => setToughness(e.target.value)}
                className="w-16 rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm text-stone-200 outline-none focus:border-emerald-600"
              />
            </Field>
            <Field label="Colors">
              <div className="flex gap-1 pt-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() =>
                      setColors((prev) =>
                        prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                      )
                    }
                    className={`h-7 w-7 rounded-full text-xs font-bold transition ${
                      colors.includes(c)
                        ? "bg-emerald-600 text-white"
                        : "bg-stone-800 text-stone-400"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Count">
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm text-stone-200 outline-none focus:border-emerald-600"
              />
            </Field>
          </div>
          <button
            disabled={!name.trim()}
            onClick={() => {
              createToken(
                {
                  name: name.trim(),
                  typeLine: typeLine.trim(),
                  power: power.trim() || undefined,
                  toughness: toughness.trim() || undefined,
                  colors,
                },
                count,
              );
              closeModal();
            }}
            className="self-end rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            Create {count > 1 ? `${count} tokens` : "token"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tokens, e.g. Treasure, Soldier, Eldrazi…"
              className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm text-stone-200 outline-none focus:border-emerald-600"
            />
            <button
              type="submit"
              disabled={searching}
              className="shrink-0 rounded-md bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-200 hover:bg-stone-700 disabled:opacity-50"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {results.map((card) => (
              <button
                key={card.id}
                onClick={() => {
                  createTokenFromCard(card);
                  closeModal();
                }}
                className="group flex flex-col gap-1 text-left"
                title={`Create ${card.name}`}
              >
                <CardImage card={card} className="aspect-[5/7] w-full transition group-hover:scale-105" />
                <span className="truncate text-[10px] text-stone-400">{card.name}</span>
              </button>
            ))}
          </div>
          {results.length === 0 && !searching && query && (
            <div className="py-6 text-center text-xs text-stone-600">
              No results yet — press Search.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold tracking-wide text-stone-500 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
