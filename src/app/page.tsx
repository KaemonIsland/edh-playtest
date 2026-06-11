"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Deck, ParsedDeckLine, ScryCard } from "@/types";
import { parseDecklist } from "@/lib/deck/parse";
import { validateCommanderDeck } from "@/lib/deck/validate";
import { resolveCards, resolveOne, type ResolveProgress } from "@/lib/scryfall/resolve";
import { saveBotDecks, saveCurrentDeck } from "@/lib/deck/storage";
import { buildDeckFromText } from "@/lib/deck/build";
import { fetchAverageDeck } from "@/lib/bot/edhrec";
import { FALLBACK_DECKS } from "@/lib/bot/fallbackDecks";
import { useGameStore } from "@/lib/game/store";
import { uid } from "@/lib/game/ids";
import { CardImage } from "@/components/cards/CardImage";

const SAMPLE = `1 Atraxa, Praetors' Voice *CMDR*
1 Sol Ring
1 Arcane Signet
1 Cultivate
1 Swords to Plowshares
1 Counterspell
1 Demonic Tutor
1 Rhystic Study
10 Forest
10 Plains
10 Island
10 Swamp`;

interface ResolvedEntry {
  line: ParsedDeckLine;
  card: ScryCard;
  isCommander: boolean;
}

type Stage = "input" | "resolving" | "review";

export default function ImportPage() {
  const router = useRouter();
  const loadDeck = useGameStore((s) => s.loadDeck);

  const [stage, setStage] = useState<Stage>("input");
  const [text, setText] = useState("");
  const [deckName, setDeckName] = useState("");
  const [progress, setProgress] = useState<ResolveProgress | null>(null);
  const [entries, setEntries] = useState<ResolvedEntry[]>([]);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [fixups, setFixups] = useState<Record<string, string>>({});
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Opponents (up to 3): each slot is a pasted list or an EDHREC average deck.
  interface OppSlot {
    mode: "paste" | "edhrec";
    text: string;
    name: string;
    commander: string;
    status: string | null;
    fetching: boolean;
  }
  const [oppSlots, setOppSlots] = useState<OppSlot[]>([]);
  const [starting, setStarting] = useState(false);

  const patchSlot = (i: number, patch: Partial<OppSlot>) =>
    setOppSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const addOpponent = () =>
    setOppSlots((prev) =>
      prev.length >= 3
        ? prev
        : [...prev, { mode: "edhrec", text: "", name: "", commander: "", status: null, fetching: false }],
    );

  const fetchEdhrec = async (i: number) => {
    const slot = oppSlots[i];
    if (!slot?.commander.trim()) return;
    patchSlot(i, { fetching: true, status: "Fetching average deck from EDHREC…" });
    try {
      const result = await fetchAverageDeck(slot.commander.trim());
      if (result) {
        patchSlot(i, {
          text: `1 ${result.commanderName} *CMDR*\n${result.lines.join("\n")}`,
          name: `${result.commanderName} (EDHREC avg)`,
          status: `✓ ${result.lines.length} entries from EDHREC${result.fromCache ? " (cached)" : ""} — community data, best-effort.`,
        });
      } else {
        patchSlot(i, {
          status:
            "EDHREC fetch failed or no average deck exists for that commander — pick a bundled deck below or paste a list.",
        });
      }
    } finally {
      patchSlot(i, { fetching: false });
    }
  };

  const useFallback = (i: number, fbIndex: number) => {
    const fb = FALLBACK_DECKS[fbIndex];
    if (!fb) return;
    patchSlot(i, {
      text: fb.list,
      name: fb.name,
      status: `✓ Using bundled deck: ${fb.name} (${fb.commander}).`,
    });
  };

  const doImport = async () => {
    setError(null);
    const parsed = parseDecklist(text);
    setParseWarnings(parsed.warnings);
    if (parsed.lines.length === 0) {
      setError("Nothing to import — paste a decklist first.");
      return;
    }
    setStage("resolving");
    try {
      const { byName, notFound } = await resolveCards(
        parsed.lines.map((l) => l.name),
        setProgress,
      );
      const resolved: ResolvedEntry[] = [];
      for (const line of parsed.lines) {
        const card = byName.get(line.name);
        if (card) resolved.push({ line, card, isCommander: line.isCommander });
      }
      // Auto-detect a commander if none was marked: a legendary creature is a
      // good guess only when it's the single first card — otherwise let the
      // user pick in the review step.
      setEntries(resolved);
      setUnresolved(notFound);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Card resolution failed.");
      setStage("input");
    }
  };

  const retryFixup = async (original: string) => {
    const attempt = (fixups[original] ?? original).trim();
    if (!attempt) return;
    const card = await resolveOne(attempt);
    if (card) {
      setEntries((prev) => [
        ...prev,
        {
          line: { raw: original, name: card.name, quantity: 1, isCommander: false, categories: [] },
          card,
          isCommander: false,
        },
      ]);
      setUnresolved((prev) => prev.filter((n) => n !== original));
    } else {
      setError(`Still couldn't find "${attempt}" on Scryfall.`);
    }
  };

  const deck: Deck = useMemo(() => {
    const commanders = entries.filter((e) => e.isCommander).map((e) => e.card);
    return {
      id: uid("deck"),
      name: deckName.trim() || "Untitled deck",
      format: "commander",
      commanders,
      entries: entries.map((e) => ({
        card: e.card,
        quantity: e.line.quantity,
        isCommander: e.isCommander,
        categories: e.line.categories,
      })),
      colorIdentity: [...new Set(commanders.flatMap((c) => c.color_identity))],
    };
  }, [entries, deckName]);

  const warnings = useMemo(
    () => (stage === "review" ? validateCommanderDeck(deck) : []),
    [deck, stage],
  );

  const cardCount = entries.reduce((n, e) => n + (e.isCommander ? 0 : e.line.quantity), 0);
  const commanders = entries.filter((e) => e.isCommander);

  const start = async () => {
    setStarting(true);
    try {
      const botDecks: Deck[] = [];
      for (let i = 0; i < oppSlots.length; i++) {
        const slot = oppSlots[i]!;
        if (!slot.text.trim()) continue;
        patchSlot(i, { status: "Resolving opponent deck via Scryfall…" });
        const built = await buildDeckFromText(
          slot.text,
          slot.name.trim() || `Opponent ${botDecks.length + 1}`,
        );
        botDecks.push(built.deck);
        if (built.notFound.length > 0) {
          patchSlot(i, {
            status: `Ready (${built.notFound.length} unresolved name${built.notFound.length === 1 ? "" : "s"} skipped).`,
          });
        }
      }
      saveCurrentDeck(deck);
      saveBotDecks(botDecks);
      loadDeck(deck);
      useGameStore.getState().loadBotDecks(botDecks);
      router.push("/play");
    } catch (e) {
      setStarting(false);
      setError(e instanceof Error ? e.message : "Failed to start the game.");
    }
  };

  return (
    <div className="min-h-dvh bg-[#08080a] text-stone-200">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">
          Glitched Goblet <span className="text-emerald-500">Playtester</span>
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Paste a Commander decklist, resolve it, and goldfish it on a real-feeling table.
        </p>

        {stage === "input" && (
          <div className="mt-6 flex flex-col gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`1 Sol Ring\n1 Arcane Signet\n1 Atraxa, Praetors' Voice *CMDR*\n…`}
              rows={14}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 p-3 font-mono text-sm text-stone-200 placeholder-stone-600 outline-none focus:border-emerald-600"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void doImport()}
                disabled={!text.trim()}
                className="rounded-md bg-emerald-700 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                Import deck
              </button>
              <button
                onClick={() => fileInput.current?.click()}
                className="rounded-md border border-stone-700 bg-stone-900 px-4 py-2 text-sm font-semibold text-stone-300 hover:bg-stone-800"
              >
                Load .txt / .dec file
              </button>
              <button
                onClick={() => setText(SAMPLE)}
                className="ml-auto text-xs text-stone-500 underline-offset-2 hover:text-stone-300 hover:underline"
              >
                Use a sample list
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".txt,.dec,.deck,text/plain"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setText(await file.text());
                  e.target.value = "";
                }}
              />
            </div>
            <p className="text-xs text-stone-600">
              Supports “1 Sol Ring”, “1x Sol Ring”, set/collector suffixes, Archidekt{" "}
              <code>*CMDR*</code> and <code>[Category]</code> tags, “// Commander” sections, and{" "}
              <code>SB:</code> lines.
            </p>
            {error && <p className="text-sm text-rose-400">{error}</p>}
          </div>
        )}

        {stage === "resolving" && (
          <div className="mt-10 flex flex-col items-center gap-3">
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-stone-800">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{
                  width: progress ? `${(progress.resolved / Math.max(progress.total, 1)) * 100}%` : "10%",
                }}
              />
            </div>
            <p className="text-sm text-stone-400">
              Resolving cards via Scryfall…{" "}
              {progress && (
                <span className="text-stone-500">
                  {progress.resolved}/{progress.total} ({progress.fromCache} from cache)
                </span>
              )}
            </p>
          </div>
        )}

        {stage === "review" && (
          <div className="mt-6 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <input
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                placeholder="Deck name"
                className="w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              />
              <span className="shrink-0 text-xs text-stone-500">
                {cardCount} cards + {commanders.length} commander{commanders.length === 1 ? "" : "s"}
              </span>
            </div>

            {unresolved.length > 0 && (
              <div className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-3">
                <div className="mb-2 text-xs font-bold text-rose-300">
                  {unresolved.length} name{unresolved.length === 1 ? "" : "s"} couldn’t be resolved
                  — fix and retry:
                </div>
                {unresolved.map((name) => (
                  <div key={name} className="mb-1.5 flex items-center gap-2">
                    <span className="w-40 truncate text-xs text-stone-400" title={name}>
                      {name}
                    </span>
                    <input
                      value={fixups[name] ?? name}
                      onChange={(e) => setFixups((p) => ({ ...p, [name]: e.target.value }))}
                      className="flex-1 rounded border border-stone-700 bg-stone-950 px-2 py-1 text-xs outline-none focus:border-emerald-600"
                    />
                    <button
                      onClick={() => void retryFixup(name)}
                      className="rounded bg-stone-800 px-2.5 py-1 text-xs font-semibold hover:bg-stone-700"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => setUnresolved((p) => p.filter((n) => n !== name))}
                      className="text-xs text-stone-500 hover:text-stone-300"
                    >
                      Skip
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="mb-2 text-xs font-bold tracking-wide text-stone-400 uppercase">
                Commander{commanders.length === 1 ? "" : "s"} — click a card to toggle
              </div>
              {commanders.length === 0 && (
                <p className="mb-2 text-xs text-amber-400">
                  No commander detected. Click a card below to designate one.
                </p>
              )}
              <div className="grid max-h-96 grid-cols-4 gap-2 overflow-y-auto rounded-lg border border-stone-800 bg-stone-950 p-3 sm:grid-cols-6 md:grid-cols-8">
                {[...entries]
                  .sort((a, b) => Number(b.isCommander) - Number(a.isCommander) || a.card.name.localeCompare(b.card.name))
                  .map((e, i) => (
                    <button
                      key={`${e.card.id}-${i}`}
                      onClick={() =>
                        setEntries((prev) =>
                          prev.map((x) =>
                            x === e ? { ...x, isCommander: !x.isCommander } : x,
                          ),
                        )
                      }
                      className={`relative rounded-md transition ${
                        e.isCommander ? "ring-2 ring-amber-400" : "hover:ring-1 hover:ring-stone-500"
                      }`}
                      style={{ contentVisibility: "auto", containIntrinsicSize: "120px" }}
                      title={`${e.line.quantity}x ${e.card.name}`}
                    >
                      <CardImage card={e.card} className="aspect-[5/7] w-full" />
                      {e.isCommander && (
                        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-400 px-1 text-[10px] font-bold text-black">
                          ★
                        </span>
                      )}
                      {e.line.quantity > 1 && (
                        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/80 px-1 text-[10px] font-bold">
                          ×{e.line.quantity}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>

            <div className="rounded-lg border border-rose-900/40 bg-stone-950 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold tracking-wide text-rose-300/90 uppercase">
                  🤖 Opponents (optional, up to 3)
                </span>
                <button
                  onClick={addOpponent}
                  disabled={oppSlots.length >= 3}
                  className="rounded-md bg-rose-900/60 px-3 py-1 text-[11px] font-bold text-rose-100 hover:bg-rose-800/70 disabled:opacity-40"
                >
                  + Add opponent
                </button>
              </div>

              {oppSlots.length === 0 && (
                <p className="text-[11px] text-stone-600">
                  No opponents — solo goldfishing. Add up to three for a full pod.
                </p>
              )}

              {oppSlots.map((slot, i) => (
                <div key={i} className="mb-2 rounded-md border border-stone-800 bg-stone-900/40 p-2">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[11px] font-bold text-stone-400">Opponent {i + 1}</span>
                    <div className="flex gap-1 rounded-lg bg-stone-900 p-0.5">
                      {(
                        [
                          ["edhrec", "EDHREC average"],
                          ["paste", "Paste decklist"],
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          onClick={() => patchSlot(i, { mode })}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                            slot.mode === mode
                              ? "bg-stone-700 text-white"
                              : "text-stone-400 hover:text-stone-200"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {slot.text && <span className="text-[10px] text-emerald-400">✓ deck loaded</span>}
                    <button
                      onClick={() => setOppSlots((prev) => prev.filter((_, j) => j !== i))}
                      className="ml-auto rounded px-1.5 text-stone-500 hover:bg-stone-800 hover:text-rose-400"
                      title="Remove this opponent"
                    >
                      ✕
                    </button>
                  </div>

                  {slot.mode === "edhrec" ? (
                    <div className="mb-2 flex gap-2">
                      <input
                        value={slot.commander}
                        onChange={(e) => patchSlot(i, { commander: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && void fetchEdhrec(i)}
                        placeholder="Commander name, e.g. Atraxa, Praetors' Voice"
                        className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
                      />
                      <button
                        onClick={() => void fetchEdhrec(i)}
                        disabled={slot.fetching || !slot.commander.trim()}
                        className="shrink-0 rounded-md bg-stone-800 px-3 py-1.5 text-xs font-semibold hover:bg-stone-700 disabled:opacity-40"
                      >
                        {slot.fetching ? "Fetching…" : "Fetch"}
                      </button>
                    </div>
                  ) : (
                    <textarea
                      value={slot.text}
                      onChange={(e) => patchSlot(i, { text: e.target.value, status: null })}
                      placeholder="Paste this opponent's decklist…"
                      rows={4}
                      className="mb-2 w-full rounded-md border border-stone-700 bg-stone-900 p-2 font-mono text-xs outline-none focus:border-emerald-600"
                    />
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-stone-500">Bundled (works offline):</span>
                    {FALLBACK_DECKS.map((fb, fbIndex) => (
                      <button
                        key={fb.name}
                        onClick={() => useFallback(i, fbIndex)}
                        className="rounded-md bg-stone-800 px-2.5 py-1 text-[11px] font-semibold text-stone-300 hover:bg-stone-700"
                      >
                        {fb.commander}
                      </button>
                    ))}
                  </div>
                  {slot.status && <p className="mt-1.5 text-[11px] text-stone-400">{slot.status}</p>}
                </div>
              ))}

              {oppSlots.length > 0 && (
                <p className="mt-1 text-[10px] leading-snug text-stone-600">
                  Bots are deliberately simple: each plays a land, casts the most expensive thing
                  it can afford (counting only its untapped lands), and attacks with everything
                  able. You resolve all triggers, targets, and blocks. Turns rotate you →
                  opponents in order.
                </p>
              )}
            </div>

            {(warnings.length > 0 || parseWarnings.length > 0) && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-900/50 bg-amber-950/10 p-3">
                {parseWarnings.concat(warnings.map((w) => w.message)).map((w, i) => (
                  <div key={i} className="text-[11px] text-amber-400/90">
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => void start()}
                disabled={entries.length === 0 || starting}
                className="rounded-md bg-emerald-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                {starting
                  ? "Preparing game…"
                  : oppSlots.some((s) => s.text.trim())
                    ? `Start vs ${oppSlots.filter((s) => s.text.trim()).length} opponent${
                        oppSlots.filter((s) => s.text.trim()).length === 1 ? "" : "s"
                      } →`
                    : "Start playtest →"}
              </button>
              <button
                onClick={() => setStage("input")}
                className="text-sm text-stone-500 hover:text-stone-300"
              >
                ← Back to decklist
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="border-t border-stone-900 py-4 text-center text-[10px] text-stone-600">
        Card data and images provided by Scryfall. Not affiliated with Wizards of the Coast.
        Unofficial Fan Content permitted under the WotC Fan Content Policy.
      </footer>
    </div>
  );
}
