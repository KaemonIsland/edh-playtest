"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, Copy, GitCompareArrows } from "lucide-react";
import type { Deck, ScryCard } from "@/types";
import { getRepo, type DeckVersion } from "@/lib/repo";
import {
  diffSnapshotsDetailed,
  snapshotOf,
  type ChangeLine,
} from "@/lib/deck/versions";
import { byColor } from "@/lib/cards/sort";
import { resolveNames, lookupResolved } from "@/lib/cards/suggest";
import { ModalShell } from "@/components/ui/ModalShell";
import { CardImage } from "@/components/cards/CardImage";

/**
 * "What do I change in the paper deck?" — a dual pull list. Pick the baseline
 * (the version you last physically built, or the session start), and get
 * Take out / Put in columns you can tick off card by card at the table.
 * Boards (Maybeboard/Ideas/Sideboard) never count — they don't exist in paper.
 */

type Baseline = "session" | string; // "session" or a version id

interface ResolvedLine extends ChangeLine {
  card?: ScryCard;
}

function ChangeColumn({
  title,
  icon,
  accent,
  lines,
  done,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  accent: "rose" | "emerald";
  lines: ResolvedLine[];
  done: Set<string>;
  onToggle: (name: string) => void;
}) {
  const colors =
    accent === "rose"
      ? { head: "text-rose-400", ring: "ring-rose-600", bg: "bg-rose-950/20 border-rose-900/40" }
      : {
          head: "text-emerald-400",
          ring: "ring-emerald-600",
          bg: "bg-emerald-950/20 border-emerald-900/40",
        };
  const remaining = lines.filter((l) => !done.has(l.name)).length;
  return (
    <div className={`flex min-w-0 flex-1 flex-col rounded-lg border p-3 ${colors.bg}`}>
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-bold ${colors.head}`}>
        {icon}
        {title}
        <span className="font-normal text-stone-500">
          ({lines.length}{remaining !== lines.length ? ` · ${remaining} left` : ""})
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-stone-600">Nothing — all set.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 overflow-y-auto">
          {lines.map((l) => {
            const checked = done.has(l.name);
            return (
              <button
                key={l.name}
                onClick={() => onToggle(l.name)}
                className={`group relative text-left transition ${checked ? "opacity-40" : ""}`}
                title={checked ? "Click to un-check" : "Click to check off"}
              >
                {l.card ? (
                  <CardImage
                    card={l.card}
                    className={`aspect-[5/7] w-full ${checked ? "grayscale" : `group-hover:ring-2 group-hover:${colors.ring}`}`}
                  />
                ) : (
                  <div className="flex aspect-[5/7] w-full items-center justify-center rounded-[5%] border border-stone-700 bg-stone-900 p-2 text-center text-[11px] text-stone-400">
                    {l.name}
                  </div>
                )}
                {l.qty > 1 && (
                  <span className="absolute top-1 left-1 rounded-full bg-black/80 px-1.5 text-[10px] font-bold text-white">
                    ×{l.qty}
                  </span>
                )}
                {checked && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check size={40} className={colors.head} />
                  </span>
                )}
                <div className={`mt-1 truncate text-[10px] ${checked ? "text-stone-600 line-through" : "text-stone-300"}`}>
                  {l.name}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChangesModal({
  original,
  draft,
  onClose,
}: {
  /** The deck as loaded this session (baseline for unsaved edits). */
  original: Deck;
  /** The current working list. */
  draft: Deck;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<DeckVersion[] | null>(null);
  const [baseline, setBaseline] = useState<Baseline>("session");
  const [resolved, setResolved] = useState<Map<string, ScryCard>>(new Map());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(original) !== JSON.stringify(draft),
    [original, draft],
  );

  useEffect(() => {
    void getRepo()
      .listVersions(draft.id)
      .then((v) => {
        const withSnapshots = v.filter((x) => x.snapshot?.length);
        setVersions(withSnapshots);
        // Default: the version marked as physically built beats everything —
        // that's the deck sitting in sleeves. Then session edits, then newest.
        const built = withSnapshots.find(
          (x) => draft.builtVersionId != null && String(x.id) === String(draft.builtVersionId),
        );
        if (built?.id != null) setBaseline(String(built.id));
        else if (!dirty && withSnapshots[0]?.id != null) setBaseline(String(withSnapshots[0].id));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id]);

  const diff = useMemo(() => {
    const base =
      baseline === "session"
        ? snapshotOf(original)
        : (versions?.find((v) => String(v.id) === baseline)?.snapshot ?? snapshotOf(original));
    return diffSnapshotsDetailed(base, snapshotOf(draft));
  }, [baseline, versions, original, draft]);

  // Resolve images: current/original decks first (free), local DB for the rest.
  useEffect(() => {
    const known = new Map<string, ScryCard>();
    for (const d of [draft, original]) {
      for (const e of d.entries) known.set(e.card.name, e.card);
      for (const c of d.commanders) known.set(c.name, c);
    }
    const missing = [...diff.adds, ...diff.cuts]
      .map((l) => l.name)
      .filter((n) => !known.has(n));
    if (missing.length === 0) {
      setResolved(known);
      return;
    }
    let cancelled = false;
    void resolveNames(missing).then((m) => {
      if (cancelled) return;
      const merged = new Map(known);
      for (const l of missing) {
        const card = lookupResolved(m, l);
        if (card) merged.set(l, card);
      }
      setResolved(merged);
    });
    return () => {
      cancelled = true;
    };
  }, [diff, draft, original]);

  const withCards = (lines: ChangeLine[]): ResolvedLine[] =>
    [...lines]
      .map((l) => ({ ...l, card: resolved.get(l.name) }))
      .sort((a, b) =>
        a.card && b.card ? byColor(a.card, b.card) : a.name.localeCompare(b.name),
      );

  const cuts = withCards(diff.cuts);
  const adds = withCards(diff.adds);

  const toggle = (name: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const copyList = async () => {
    const fmt = (lines: ChangeLine[]) => lines.map((l) => `${l.qty} ${l.name}`).join("\n");
    const text = `TAKE OUT (${cuts.length})\n${fmt(cuts)}\n\nPUT IN (${adds.length})\n${fmt(adds)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      size="2xl"
      anchor="top"
      title={
        <span className="flex items-center gap-2">
          <GitCompareArrows size={15} className="text-sky-400" />
          Physical changes
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">
          Compare against
        </span>
        <select
          value={baseline}
          onChange={(e) => {
            setBaseline(e.target.value);
            setDone(new Set());
          }}
          className="rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-xs outline-none focus:border-emerald-600"
        >
          <option value="session">This session's edits (since you opened the editor)</option>
          {(versions ?? []).map((v) => (
            <option key={String(v.id)} value={String(v.id)}>
              {v.title} — {new Date(v.date).toLocaleDateString()}
              {draft.builtVersionId != null && String(v.id) === String(draft.builtVersionId)
                ? " · built in paper"
                : ""}
            </option>
          ))}
        </select>
        <button
          onClick={() => void copyList()}
          className="ml-auto rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-800"
        >
          {copied ? (
            <>
              <Check size={12} className="inline align-[-2px]" /> Copied
            </>
          ) : (
            <>
              <Copy size={12} className="inline align-[-2px]" /> Copy as text
            </>
          )}
        </button>
      </div>
      <p className="mb-3 text-[11px] text-stone-500">
        Pick the version you last built in paper — the lists below are exactly what to pull and
        what to sleeve. Click cards to check them off as you go. Maybeboard/Ideas never count.
      </p>

      <div className="flex gap-3">
        <ChangeColumn
          title="Take out"
          icon={<ArrowUpFromLine size={13} />}
          accent="rose"
          lines={cuts}
          done={done}
          onToggle={toggle}
        />
        <ChangeColumn
          title="Put in"
          icon={<ArrowDownToLine size={13} />}
          accent="emerald"
          lines={adds}
          done={done}
          onToggle={toggle}
        />
      </div>

      {versions !== null && versions.length === 0 && (
        <p className="mt-3 text-[10px] text-stone-600">
          Tip: save with a changelog entry each time you update the paper deck — those snapshots
          become the baselines here.
        </p>
      )}
    </ModalShell>
  );
}
