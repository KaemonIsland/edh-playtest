"use client";

import { Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { Deck, DeckEntry, ScryCard } from "@/types";
import { BOARD_CATEGORIES } from "@/types";
import { CardRow, type ViewMode } from "@/components/builder/CardRows";
import { getRepo, type DeckVersion } from "@/lib/repo";
import {
  computeOdds,
  computeSkeleton,
  DEFAULT_SKELETON,
  typeTally,
  groupEntries,
  type DeckStats,
} from "@/lib/deck/stats";
import { diffSnapshots, restoreSnapshot } from "@/lib/deck/versions";
import { ManaCost } from "@/components/cards/ManaCost";

/**
 * The builder's right-hand dock: judgment lives here, permanently visible.
 * Tabs: Skeleton (targets vs. actual + type tally), Stats (curve/colors/odds),
 * History (versions with restore + compare). Below the tabs, the boards
 * (Maybeboard/Ideas/…) stay pinned — always visible, always drop targets.
 */

type DockTab = "skeleton" | "stats" | "history";

const PIP_STYLE: Record<string, string> = {
  W: "bg-amber-100",
  U: "bg-sky-500",
  B: "bg-stone-500",
  R: "bg-red-500",
  G: "bg-green-500",
};

/** How recently an add still counts as "new considering". */
const NEW_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

function SkeletonBar({ count, target }: { count: number; target: number }) {
  const ratio = target > 0 ? count / target : 1;
  const color = ratio >= 1 ? "bg-emerald-500" : ratio >= 0.6 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-800">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
    </div>
  );
}

function BoardSection({
  name,
  entries,
  ownedIds,
  dragging,
  viewMode,
  selection,
  onToggleSelect,
  onOpen,
}: {
  name: string;
  entries: DeckEntry[];
  ownedIds: Set<string>;
  dragging: boolean;
  viewMode: ViewMode;
  selection: Set<string>;
  onToggleSelect: (cardId: string) => void;
  onOpen: (card: ScryCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cat:${name}` });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border p-2 transition-colors ${
        isOver
          ? "border-emerald-600/70 bg-emerald-950/20"
          : dragging
            ? "border-stone-600 bg-stone-900/60"
            : "border-stone-800 bg-stone-950/60"
      }`}
    >
      <div className="mb-1 flex items-baseline gap-1.5 px-1">
        <span className="text-[11px] font-bold text-stone-400">{name}</span>
        <span className="font-mono text-[10px] text-stone-600">
          ({entries.reduce((n, e) => n + e.quantity, 0)})
        </span>
        {dragging && (
          <span className="ml-auto text-[9px] font-bold tracking-wide text-emerald-500 uppercase">
            drop to bench
          </span>
        )}
      </div>
      <div className={`flex flex-col ${viewMode === "text" ? "gap-0.5" : ""}`}>
        {entries.map((e) => (
          <CardRow
            key={e.card.id}
            view={viewMode}
            le={{ entry: e, ghost: false }}
            owned={ownedIds.has(e.card.oracle_id)}
            selected={selection.has(e.card.id)}
            onOpen={onOpen}
            onToggleSelect={onToggleSelect}
          />
        ))}
        {entries.length === 0 && (
          <div className="rounded border border-dashed border-stone-800 px-2 py-2 text-center text-[10px] text-stone-700">
            drop cards here
          </div>
        )}
      </div>
    </div>
  );
}

export function DeckDock({
  deck,
  update,
  stats,
  ownedIds,
  dragging,
  viewMode,
  selection,
  onToggleSelect,
  onOpenCard,
  onReplaceDraft,
}: {
  deck: Deck;
  update: (fn: (d: Deck) => void) => void;
  stats: DeckStats;
  ownedIds: Set<string>;
  dragging: boolean;
  /** Boards render in the same Stacks/Text view as the main columns. */
  viewMode: ViewMode;
  selection: Set<string>;
  onToggleSelect: (cardId: string) => void;
  onOpenCard: (card: ScryCard) => void;
  /** History restore: replace the editor draft with a rebuilt deck. */
  onReplaceDraft: (deck: Deck, note: string) => void;
}) {
  const [tab, setTab] = useState<DockTab>("skeleton");
  const [editTargets, setEditTargets] = useState(false);
  const [newTarget, setNewTarget] = useState("");
  const [versions, setVersions] = useState<DeckVersion[] | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<number | string | null>(null);
  const [compareIds, setCompareIds] = useState<(number | string)[]>([]);
  const [restoring, setRestoring] = useState(false);
  const [historyNote, setHistoryNote] = useState<string | null>(null);
  const [oddsTab, setOddsTab] = useState<"categories" | "types">("categories");

  const skeleton = useMemo(() => computeSkeleton(deck, stats), [deck, stats]);
  const tally = useMemo(() => typeTally(deck), [deck]);
  const odds = useMemo(() => computeOdds(deck), [deck]);
  const maxCurve = Math.max(1, ...stats.curve.map((c) => c.count));

  // Excluded boards (Maybeboard / Ideas / anything marked "not in deck").
  const boardGroups = useMemo(() => groupEntries(deck).filter((g) => !g.inDeck), [deck]);
  const boardNames = new Set(boardGroups.map((g) => g.group));
  // Empty standard boards appear as drop targets while dragging.
  const emptyBoards = BOARD_CATEGORIES.filter((b) => !boardNames.has(b) && dragging);

  // "New considering": recent adds across all boards, newest first.
  const newConsidering = useMemo(() => {
    const now = Date.now();
    return boardGroups
      .flatMap((g) => g.entries)
      .filter((e) => e.addedAt && now - e.addedAt < NEW_WINDOW_MS)
      .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
      .slice(0, 8);
  }, [boardGroups]);

  const loadVersions = useCallback(async () => {
    setVersions(await getRepo().listVersions(deck.id));
  }, [deck.id]);

  useEffect(() => {
    if (tab === "history" && versions === null) void loadVersions();
  }, [tab, versions, loadVersions]);

  const setTarget = (name: string, value: number) => {
    update((d) => {
      const base = d.skeleton ?? { ...DEFAULT_SKELETON };
      if (value <= 0) {
        delete base[name];
      } else {
        base[name] = value;
      }
      d.skeleton = { ...base };
    });
  };

  const restore = async (v: DeckVersion) => {
    if (!v.snapshot?.length) return;
    setRestoring(true);
    setHistoryNote(null);
    try {
      const { deck: restored, missing } = await restoreSnapshot(deck, v.snapshot);
      onReplaceDraft(
        restored,
        missing.length > 0
          ? `Restored “${v.title}” — ${missing.length} card(s) not found: ${missing.join(", ")}`
          : `Restored “${v.title}” into the editor. Save to keep it.`,
      );
      setHistoryNote("Restored into the editor — review and Save to keep it.");
    } finally {
      setRestoring(false);
    }
  };

  const toggleCompare = (id: number | string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev.slice(-1), id],
    );
  };

  const compareDiff = useMemo(() => {
    if (compareIds.length !== 2 || !versions) return null;
    const a = versions.find((v) => v.id === compareIds[0]);
    const b = versions.find((v) => v.id === compareIds[1]);
    if (!a?.snapshot || !b?.snapshot) return null;
    const [older, newer] = a.date <= b.date ? [a, b] : [b, a];
    return { older, newer, ...diffSnapshots(older.snapshot!, newer.snapshot!) };
  }, [compareIds, versions]);

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-stone-800 bg-stone-950/70">
      {/* Tabs */}
      <div className="sticky top-0 z-10 flex gap-0.5 border-b border-stone-800 bg-stone-950 px-2 pt-2">
        {(
          [
            ["skeleton", "Skeleton"],
            ["stats", "Stats"],
            ["history", "History"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-t-md px-3 py-1.5 text-[11px] font-bold transition ${
              tab === key
                ? "bg-stone-900 text-stone-100"
                : "text-stone-500 hover:text-stone-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---- Skeleton ---- */}
      {tab === "skeleton" && (
        <div className="border-b border-stone-800 p-3">
          <div className="flex flex-col gap-1.5">
            {skeleton.map((row) => (
              <div key={row.name} className="flex items-center gap-2">
                <span className="w-24 truncate text-[11px] text-stone-300" title={row.name}>
                  {row.name}
                  {row.auto && (
                    <span className="ml-1 text-[8px] font-bold text-stone-600 uppercase" title="Auto-detected from card text — categorize cards to take over">
                      auto
                    </span>
                  )}
                </span>
                <SkeletonBar count={row.count} target={row.target} />
                {editTargets ? (
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-stone-400">
                    {row.count}/
                    <input
                      type="number"
                      min={0}
                      value={row.target}
                      onChange={(e) => setTarget(row.name, parseInt(e.target.value, 10) || 0)}
                      className="w-12 rounded border border-stone-700 bg-stone-900 px-1 py-0.5 text-right text-[10px] outline-none focus:border-emerald-600"
                    />
                    <button
                      onClick={() => setTarget(row.name, 0)}
                      className="text-stone-600 hover:text-rose-400"
                      title="Remove target"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ) : (
                  <span
                    className={`w-12 shrink-0 text-right font-mono text-[11px] tabular-nums ${
                      row.count >= row.target ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {row.count}/{row.target}
                  </span>
                )}
              </div>
            ))}
          </div>

          {editTargets && (
            <input
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTarget.trim()) {
                  setTarget(newTarget.trim(), 5);
                  setNewTarget("");
                }
              }}
              placeholder="+ Add a target category (Enter)…"
              className="mt-2 w-full rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-[11px] outline-none focus:border-emerald-600"
            />
          )}

          <p className="mt-2 text-[10px] leading-relaxed text-stone-600">
            Counts include <span className="text-stone-400">every category on a card</span>, not
            just its column. Lands count by card type.
          </p>
          <div className="mt-1.5 flex gap-3 font-mono text-[10px]">
            <button
              onClick={() => setEditTargets((v) => !v)}
              className="text-sky-400 hover:text-sky-300"
            >
              {editTargets ? "Done editing" : "Edit targets"}
            </button>
            <button
              onClick={() =>
                update((d) => {
                  d.skeleton = { ...DEFAULT_SKELETON };
                })
              }
              className="text-stone-500 hover:text-stone-300"
              title="Reset targets to the standard template"
            >
              Reset template
            </button>
          </div>

          {/* Type tally */}
          <div className="mt-3 border-t border-stone-800 pt-2.5">
            <div className="mb-1.5 text-[9px] font-bold tracking-widest text-stone-600 uppercase">
              By card type
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {tally.map((t) => (
                <div key={t.type} className="flex justify-between text-[11px] text-stone-400">
                  <span>{t.type}</span>
                  <span className="font-mono font-semibold text-stone-200 tabular-nums">
                    {t.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- Stats ---- */}
      {tab === "stats" && (
        <div className="border-b border-stone-800 p-3">
          {/* Curve */}
          <div className="mb-1 text-[9px] font-bold tracking-widest text-stone-600 uppercase">
            Mana curve <span className="normal-case">· avg {stats.avgCmc.toFixed(2)}</span>
          </div>
          <div className="flex h-20 items-end gap-1">
            {stats.curve.map((b) => (
              <div key={b.cmc} className="flex flex-1 flex-col items-center gap-0.5">
                <span className="text-[9px] text-stone-600">{b.count || ""}</span>
                <div
                  className="w-full rounded-t bg-emerald-700"
                  style={{ height: `${(b.count / maxCurve) * 56}px` }}
                />
                <span className="text-[9px] text-stone-600">{b.cmc}</span>
              </div>
            ))}
          </div>

          {/* Color balance */}
          <div className="mt-3 mb-1 text-[9px] font-bold tracking-widest text-stone-600 uppercase">
            Pips vs. sources
          </div>
          <div className="flex flex-col gap-1">
            {stats.colorBalance.map((b) => (
              <div key={b.color} className="flex items-center gap-1.5 text-[10px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/mana/${b.color}.svg`} alt={b.color} className="h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <div className="flex h-1.5 overflow-hidden rounded bg-stone-800">
                    <div className={PIP_STYLE[b.color]} style={{ width: `${b.pipShare * 100}%` }} />
                  </div>
                  <div className="mt-0.5 flex h-1.5 overflow-hidden rounded bg-stone-800">
                    <div
                      className={`${PIP_STYLE[b.color]} opacity-50`}
                      style={{ width: `${b.sourceShare * 100}%` }}
                    />
                  </div>
                </div>
                <span className="w-20 shrink-0 text-right text-stone-500">
                  {b.pips}p · {b.sources}src
                </span>
                {b.shortfall && (
                  <span className="shrink-0 rounded bg-rose-900/60 px-1 text-[8px] font-bold text-rose-300">
                    SHORT
                  </span>
                )}
              </div>
            ))}
            {stats.colorBalance.length === 0 && (
              <span className="text-[10px] text-stone-600">Colorless deck.</span>
            )}
          </div>

          {/* Key numbers */}
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <div className="rounded-md bg-stone-900 p-2">
              <div className="text-[9px] text-stone-500">Cards</div>
              <div className="text-sm font-bold text-stone-100">{stats.cardCount}</div>
            </div>
            <div className="rounded-md bg-stone-900 p-2" title="Rough estimate from commander CMC and ramp count">
              <div className="text-[9px] text-stone-500">Cmdr by</div>
              <div className="text-sm font-bold text-stone-100">
                {stats.expectedCommanderTurn !== null ? `~T${stats.expectedCommanderTurn}` : "—"}
              </div>
            </div>
            <div className="rounded-md bg-stone-900 p-2">
              <div className="text-[9px] text-stone-500">Price</div>
              <div className="text-sm font-bold text-stone-100">
                {stats.priceUsd !== null ? `$${stats.priceUsd.toFixed(0)}` : "—"}
              </div>
            </div>
          </div>

          {/* Opening-hand odds */}
          <div className="mt-3 mb-1 flex items-center gap-2">
            <span className="text-[9px] font-bold tracking-widest text-stone-600 uppercase">
              Opening hand (7)
            </span>
            <div className="flex gap-0.5 rounded-md bg-stone-900 p-0.5">
              {(["categories", "types"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setOddsTab(t)}
                  className={`rounded px-1.5 py-0.5 text-[9px] font-semibold capitalize ${
                    oddsTab === t ? "bg-stone-700 text-white" : "text-stone-500"
                  }`}
                >
                  {t === "categories" ? "Category" : "Type"}
                </button>
              ))}
            </div>
          </div>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-left text-[8px] tracking-wide text-stone-600 uppercase">
                <th className="py-0.5"> </th>
                <th className="py-0.5 text-right">Qty</th>
                <th className="py-0.5 text-right">≥1</th>
                <th className="py-0.5 text-right">≥2</th>
              </tr>
            </thead>
            <tbody>
              {odds[oddsTab].map((row) => (
                <tr key={row.label} className="border-t border-stone-900 text-stone-300">
                  <td className="max-w-0 truncate py-0.5 pr-2">{row.label}</td>
                  <td className="py-0.5 text-right text-stone-600 tabular-nums">{row.qty}</td>
                  <td className="py-0.5 text-right font-semibold tabular-nums">
                    {Math.round(row.p1 * 100)}%
                  </td>
                  <td className="py-0.5 text-right text-stone-500 tabular-nums">
                    {Math.round(row.p2 * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- History ---- */}
      {tab === "history" && (
        <div className="border-b border-stone-800 p-3">
          {historyNote && (
            <p className="mb-2 rounded-md border border-emerald-800/50 bg-emerald-950/30 px-2 py-1.5 text-[10px] text-emerald-300">
              {historyNote}
            </p>
          )}
          {compareDiff && (
            <div className="mb-2 rounded-md border border-stone-700 bg-stone-900 p-2">
              <div className="mb-1 text-[10px] font-bold text-stone-300">
                “{compareDiff.older.title}” → “{compareDiff.newer.title}”
              </div>
              <div className="max-h-40 overflow-y-auto text-[10px]">
                {compareDiff.adds.map((a, i) => (
                  <div key={`a${i}`} className="text-emerald-400">+ {a.name}</div>
                ))}
                {compareDiff.cuts.map((c, i) => (
                  <div key={`c${i}`} className="text-rose-400">− {c.name}</div>
                ))}
                {compareDiff.adds.length + compareDiff.cuts.length === 0 && (
                  <span className="text-stone-500">Identical lists.</span>
                )}
              </div>
            </div>
          )}
          {versions === null ? (
            <p className="text-[11px] text-stone-600">Loading versions…</p>
          ) : versions.length === 0 ? (
            <p className="text-[11px] text-stone-600">
              No versions yet — Save with a changelog entry to start the timeline.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-[9px] text-stone-600">
                Tick two versions to compare them. Restore rewinds the editor (not saved until you
                Save).
              </p>
              {versions.map((v) => (
                <div key={String(v.id)} className="rounded-md bg-stone-900 p-2">
                  <div className="flex items-center gap-1.5">
                    {v.snapshot && (
                      <input
                        type="checkbox"
                        checked={compareIds.includes(v.id!)}
                        onChange={() => toggleCompare(v.id!)}
                        className="accent-emerald-600"
                        title="Select for compare"
                      />
                    )}
                    <button
                      onClick={() =>
                        setExpandedVersion(expandedVersion === v.id ? null : (v.id ?? null))
                      }
                      className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold text-stone-200 hover:text-white"
                    >
                      {v.title}
                    </button>
                    <span className="shrink-0 text-[9px] text-stone-600">
                      {new Date(v.date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[9px] text-stone-500">
                    <span className="text-emerald-500">+{v.adds.length}</span>
                    <span className="text-rose-400">−{v.cuts.length}</span>
                    {v.snapshot ? (
                      <button
                        onClick={() => void restore(v)}
                        disabled={restoring}
                        className="ml-auto rounded border border-sky-800/60 bg-sky-950/40 px-1.5 py-0.5 font-bold text-sky-300 hover:bg-sky-900/50 disabled:opacity-40"
                      >
                        {restoring ? "Restoring…" : <><Undo2 size={10} className="inline align-[-1px]" /> Restore</>}
                      </button>
                    ) : (
                      <span className="ml-auto text-stone-700" title="Saved before snapshots existed — only the diff is stored">
                        no snapshot
                      </span>
                    )}
                  </div>
                  {expandedVersion === v.id && (
                    <div className="mt-1.5 max-h-36 overflow-y-auto border-t border-stone-800 pt-1.5 text-[10px]">
                      {v.adds.map((a, i) => (
                        <div key={`a${i}`} className="text-emerald-400">+ {a.name}</div>
                      ))}
                      {v.cuts.map((c, i) => (
                        <div key={`c${i}`} className="text-rose-400">− {c.name}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Boards: pinned, always visible ---- */}
      <div className="flex flex-col gap-2 p-3">
        {newConsidering.length > 0 && (
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/10 p-2">
            <div className="mb-1 flex items-baseline gap-1.5 px-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-[11px] font-bold text-emerald-400">New considering</span>
              <span className="font-mono text-[10px] text-stone-600">
                ({newConsidering.length})
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {newConsidering.map((e) => (
                <button
                  key={`new-${e.card.id}`}
                  onClick={() => onOpenCard(e.card)}
                  className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-stone-300 hover:bg-stone-800"
                >
                  <span className="min-w-0 flex-1 truncate">{e.card.name}</span>
                  <ManaCost cost={e.card.mana_cost} size={10} className="shrink-0" />
                  <span className="shrink-0 font-mono text-[9px] text-stone-600 uppercase">
                    {e.card.set ?? ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {boardGroups.map(({ group, entries }) => (
          <BoardSection
            key={group}
            name={group}
            entries={entries}
            ownedIds={ownedIds}
            dragging={dragging}
            viewMode={viewMode}
            selection={selection}
            onToggleSelect={onToggleSelect}
            onOpen={onOpenCard}
          />
        ))}
        {emptyBoards.map((b) => (
          <BoardSection
            key={b}
            name={b}
            entries={[]}
            ownedIds={ownedIds}
            dragging={dragging}
            viewMode={viewMode}
            selection={selection}
            onToggleSelect={onToggleSelect}
            onOpen={onOpenCard}
          />
        ))}
        {boardGroups.length === 0 && emptyBoards.length === 0 && (
          <p className="px-1 text-[10px] leading-relaxed text-stone-600">
            No maybeboard yet — drag a card here while dragging, or add one from the card modal's
            “In decks” tab.
          </p>
        )}
      </div>
    </aside>
  );
}
