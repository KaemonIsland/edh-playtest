"use client";

import { useEffect, useState } from "react";
import { getRepo, PRIMER_SECTIONS, type Primer } from "@/lib/repo";
import { Markdown } from "@/lib/markdown";

function emptyPrimer(deckId: string): Primer {
  return { deckId, strategy: "", combos: "", mulligans: "", matchups: "", budget: "", updatedAt: 0 };
}

/** Owner-editable markdown primer, section by section. */
export function PrimerEditor({ deckId }: { deckId: string }) {
  const [primer, setPrimer] = useState<Primer | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getRepo()
      .getPrimer(deckId)
      .then((p) => setPrimer(p ?? emptyPrimer(deckId)));
  }, [deckId]);

  if (!primer) return null;
  const hasContent = PRIMER_SECTIONS.some((s) => primer[s.key].trim());

  const save = async (key: (typeof PRIMER_SECTIONS)[number]["key"]) => {
    setSaving(true);
    try {
      const next = { ...primer, [key]: draft };
      await getRepo().savePrimer(next);
      setPrimer(next);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-stone-800 bg-stone-950 p-4">
      <h2 className="mb-3 text-sm font-bold tracking-wide text-stone-200 uppercase">Primer</h2>
      {!hasContent && !editing && (
        <p className="mb-2 text-xs text-stone-600">
          No primer yet — click a section to write one (markdown supported).
        </p>
      )}
      <div className="flex flex-col gap-3">
        {PRIMER_SECTIONS.map(({ key, label }) => (
          <div key={key} className="rounded-lg bg-stone-900/60 p-3">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-xs font-bold text-emerald-500">{label}</h3>
              {editing === key ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => void save(key)}
                    disabled={saving}
                    className="rounded bg-emerald-700 px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="text-[11px] text-stone-500 hover:text-stone-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditing(key);
                    setDraft(primer[key]);
                  }}
                  className="text-[11px] text-stone-500 hover:text-stone-300"
                >
                  ✎ Edit
                </button>
              )}
            </div>
            {editing === key ? (
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={8}
                placeholder={`Write the ${label.toLowerCase()} in markdown…`}
                className="w-full rounded-md border border-stone-700 bg-stone-950 p-2 font-mono text-xs text-stone-200 outline-none focus:border-emerald-600"
              />
            ) : primer[key].trim() ? (
              <Markdown text={primer[key]} />
            ) : (
              <p className="text-[11px] text-stone-700 italic">Empty.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
