"use client";

import { useCallback, useEffect, useState } from "react";
import { getRepo, type DeckVersion, type VersionChange } from "@/lib/repo";

/** Parse "Card name | reason" lines from the add/cut textareas. */
function parseChanges(text: string): VersionChange[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split("|");
      return { name: name!.trim(), reason: rest.join("|").trim() || undefined };
    });
}

export function ChangelogTimeline({ deckId }: { deckId: string }) {
  const [versions, setVersions] = useState<DeckVersion[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [addsText, setAddsText] = useState("");
  const [cutsText, setCutsText] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setVersions(await getRepo().listVersions(deckId));
  }, [deckId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await getRepo().addVersion({
        deckId,
        date: Date.now(),
        title: title.trim(),
        adds: parseChanges(addsText),
        cuts: parseChanges(cutsText),
        notes: notes.trim() || undefined,
      });
      setTitle("");
      setAddsText("");
      setCutsText("");
      setNotes("");
      setAdding(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-stone-800 bg-stone-950 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-wide text-stone-200 uppercase">Changelog</h2>
        <button
          onClick={() => setAdding(!adding)}
          className="rounded-md bg-stone-800 px-3 py-1 text-[11px] font-semibold text-stone-300 hover:bg-stone-700"
        >
          {adding ? "Cancel" : "+ New update"}
        </button>
      </div>

      {adding && (
        <div className="mb-4 rounded-lg border border-stone-800 bg-stone-900/60 p-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Update title, e.g. “Cutting the clunky 6-drops”"
            className="mb-2 w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
          />
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-bold tracking-wide text-emerald-500 uppercase">
                + Adds (one per line, “Card | reason”)
              </label>
              <textarea
                value={addsText}
                onChange={(e) => setAddsText(e.target.value)}
                rows={4}
                placeholder={"Beast Within | flexible answer\nSol Ring"}
                className="mt-1 w-full rounded-md border border-stone-700 bg-stone-950 p-2 font-mono text-xs outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-wide text-rose-400 uppercase">
                − Cuts (one per line, “Card | reason”)
              </label>
              <textarea
                value={cutsText}
                onChange={(e) => setCutsText(e.target.value)}
                rows={4}
                placeholder={"Craw Wurm | never impactful"}
                className="mt-1 w-full rounded-md border border-stone-700 bg-stone-950 p-2 font-mono text-xs outline-none focus:border-emerald-600"
              />
            </div>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notes (optional)"
            className="mb-2 w-full rounded-md border border-stone-700 bg-stone-950 p-2 text-xs outline-none focus:border-emerald-600"
          />
          <button
            onClick={() => void submit()}
            disabled={busy || !title.trim()}
            className="rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            Save update
          </button>
        </div>
      )}

      {versions.length === 0 && !adding && (
        <p className="text-xs text-stone-600">No updates logged yet.</p>
      )}

      {/* Timeline */}
      <div className="relative ml-2 border-l border-stone-800 pl-5">
        {versions.map((v) => (
          <div key={String(v.id)} className="relative mb-5">
            <span className="absolute top-1 -left-[26px] h-2.5 w-2.5 rounded-full bg-emerald-600 ring-4 ring-stone-950" />
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-stone-100">{v.title}</h3>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[10px] text-stone-500">
                  {new Date(v.date).toLocaleDateString()}
                </span>
                <button
                  onClick={async () => {
                    if (v.id !== undefined) {
                      await getRepo().deleteVersion(deckId, v.id);
                      await refresh();
                    }
                  }}
                  className="text-[10px] text-stone-600 hover:text-rose-400"
                  title="Delete entry"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="mt-1 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
              <div>
                {v.adds.map((a, i) => (
                  <div key={i} className="text-emerald-400">
                    + {a.name}
                    {a.reason && <span className="text-stone-500"> — {a.reason}</span>}
                  </div>
                ))}
              </div>
              <div>
                {v.cuts.map((c, i) => (
                  <div key={i} className="text-rose-400">
                    − {c.name}
                    {c.reason && <span className="text-stone-500"> — {c.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
            {v.notes && <p className="mt-1 text-[11px] text-stone-500">{v.notes}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
