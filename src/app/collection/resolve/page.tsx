"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ScryCard } from "@/types";
import { FINISH_LABEL, getRepo, type UnresolvedImport } from "@/lib/repo";
import { adjustCollection } from "@/lib/cards/collection";
import { CardSearchModal } from "@/components/builder/CardSearchModal";

/**
 * Manual Resolution — CSV import rows that couldn't be auto-matched to a
 * Scryfall printing. The user searches for the right card and resolves each
 * one (adds the captured quantity/finish to the collection), or dismisses it.
 */
export default function ResolveImportsPage() {
  const [rows, setRows] = useState<UnresolvedImport[] | null>(null);
  const [resolving, setResolving] = useState<UnresolvedImport | null>(null);
  const [justResolved, setJustResolved] = useState<{ name: string; into: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setRows(await getRepo().listUnresolvedImports());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Resolve a queued row to a chosen printing: add it to the collection, then
  // drop the row from the queue.
  const resolveRow = async (row: UnresolvedImport, card: ScryCard) => {
    setBusy(true);
    try {
      await adjustCollection(card, row.finish, row.quantity);
      await getRepo().removeUnresolvedImport(row.id);
      setJustResolved({ name: row.name, into: card.name });
      setResolving(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (row: UnresolvedImport) => {
    setBusy(true);
    try {
      await getRepo().removeUnresolvedImport(row.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (!rows?.length) return;
    if (!confirm(`Dismiss all ${rows.length} unresolved row(s)? They won't be added to your collection.`)) return;
    setBusy(true);
    try {
      await getRepo().clearUnresolvedImports();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[#08080a] text-stone-200">
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16">
        <nav className="mb-4 text-xs text-stone-400">
          <Link href="/collection" className="hover:text-white">← Collection</Link>
          <span className="ml-2 font-semibold text-stone-200">Resolve imports</span>
        </nav>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Manual resolution</h1>
            <p className="mt-0.5 max-w-xl text-sm text-stone-500">
              These CSV rows couldn’t be matched to a Scryfall printing automatically — usually a
              misspelled name, a token, or a missing set/collector number. Find the right card to add
              it, or dismiss rows you don’t want.
            </p>
          </div>
          {!!rows?.length && (
            <button
              onClick={() => void clearAll()}
              disabled={busy}
              className="shrink-0 rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-800 disabled:opacity-40"
            >
              Dismiss all
            </button>
          )}
        </div>

        {justResolved && (
          <div className="mb-4 rounded-lg bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
            ✓ Resolved “{justResolved.name}” → added <strong>{justResolved.into}</strong> to your
            collection.
          </div>
        )}

        {rows === null ? (
          <p className="text-sm text-stone-600">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-800 p-10 text-center">
            <p className="text-sm text-stone-400">Nothing to resolve 🎉</p>
            <p className="mt-1 text-xs text-stone-600">
              Every imported card was matched. Unmatched rows from future CSV imports will show up
              here.
            </p>
            <Link
              href="/collection"
              className="mt-4 inline-block rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
            >
              ← Back to collection
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-stone-500">
              {rows.length} row{rows.length === 1 ? "" : "s"} to resolve
            </p>
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-stone-100">{row.name}</span>
                    {row.quantity > 1 && (
                      <span className="shrink-0 rounded bg-stone-800 px-1.5 py-0.5 text-[10px] font-bold text-stone-300">
                        ×{row.quantity}
                      </span>
                    )}
                    {row.finish !== "nonfoil" && (
                      <span className="shrink-0 rounded bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                        {FINISH_LABEL[row.finish]}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-stone-500">
                    {[
                      row.setName || (row.setCode ? row.setCode.toUpperCase() : null),
                      row.collectorNumber ? `#${row.collectorNumber}` : null,
                      row.scryfallId ? `Scryfall id ${row.scryfallId.slice(0, 8)}…` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No set or collector number in the CSV"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => {
                      setJustResolved(null);
                      setResolving(row);
                    }}
                    disabled={busy}
                    className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
                  >
                    🔍 Find card
                  </button>
                  <button
                    onClick={() => void dismiss(row)}
                    disabled={busy}
                    className="rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-xs font-semibold text-stone-400 hover:bg-stone-800 hover:text-rose-400 disabled:opacity-40"
                    title="Dismiss this row without adding it"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {resolving && (
        <CardSearchModal
          initialQuery={resolving.name}
          onOpenCard={(card) => void resolveRow(resolving, card)}
          onClose={() => setResolving(null)}
        />
      )}
    </div>
  );
}
