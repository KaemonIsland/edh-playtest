"use client";

import { useRef, useState } from "react";
import {
  importCollection,
  parseCollectionCsv,
  type CsvParseResult,
  type ImportProgress,
  type ImportResult,
} from "@/lib/cards/csvImport";

type Stage = "pick" | "preview" | "running" | "done";

/** CSV collection importer (Mana Flood / Archidekt / Moxfield exports). */
export function ImportCsvModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<CsvParseResult | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const p = parseCollectionCsv(text);
      if (p.rows.length === 0) {
        setError(
          "No importable rows found — the CSV needs at least a card name column (a Scryfall ID, or set + collector number, makes matching exact).",
        );
        return;
      }
      setParsed(p);
      setStage("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the file.");
    }
  };

  const run = async () => {
    if (!parsed) return;
    setStage("running");
    try {
      const res = await importCollection(parsed, mode, setProgress);
      setResult(res);
      setStage("done");
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setStage("preview");
    }
  };

  // Unique printings to resolve = distinct identifier per row (id, set+cn, or name).
  const uniqueIds = parsed
    ? new Set(
        parsed.rows.map(
          (r) =>
            r.scryfallId ||
            (r.setCode && r.collectorNumber ? `${r.setCode}:${r.collectorNumber}` : "") ||
            r.name.toLowerCase(),
        ),
      ).size
    : 0;
  const totalCards = parsed ? parsed.rows.reduce((n, r) => n + r.quantity, 0) : 0;
  const etaSec = Math.round(Math.ceil(uniqueIds / 75) * 0.55);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={stage === "running" ? undefined : onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-stone-700 bg-stone-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-stone-200">Import collection from CSV</h2>
          {stage !== "running" && (
            <button onClick={onClose} className="rounded px-2 text-stone-500 hover:text-stone-200">
              ✕
            </button>
          )}
        </div>

        {stage === "pick" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-stone-500">
              Works with CSV exports from most apps — Mana Flood, ManaBox, Moxfield, Archidekt,
              Deckbox, TCGplayer, Dragon Shield, and more. Cards match by Scryfall ID when present,
              otherwise by set + collector number or name. Quantity and foil/finish are read too.
            </p>
            <button
              onClick={() => fileInput.current?.click()}
              className="rounded-lg border border-dashed border-stone-700 bg-stone-900/50 px-4 py-8 text-sm font-semibold text-stone-300 hover:border-stone-500 hover:bg-stone-900"
            >
              📄 Choose a .csv file…
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </div>
        )}

        {stage === "preview" && parsed && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg bg-stone-900 p-3 text-xs text-stone-300">
              <div className="font-semibold text-stone-100">{fileName}</div>
              <div className="mt-1 grid grid-cols-2 gap-1 text-stone-400">
                <span>{parsed.rows.length.toLocaleString()} rows to import</span>
                <span>{totalCards.toLocaleString()} total cards</span>
                <span>{uniqueIds.toLocaleString()} unique printings</span>
                {parsed.skipped.length > 0 && (
                  <span className="text-amber-400">{parsed.skipped.length} skipped (no name/ID)</span>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
                Import mode
              </div>
              <div className="flex gap-2">
                {(
                  [
                    ["merge", "Merge", "Add these on top of your current collection"],
                    ["replace", "Replace", "Wipe the current collection first"],
                  ] as const
                ).map(([m, label, hint]) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-md border px-3 py-2 text-left transition ${
                      mode === m
                        ? "border-emerald-600 bg-emerald-950/40"
                        : "border-stone-700 bg-stone-900 hover:bg-stone-800"
                    }`}
                  >
                    <div className="text-xs font-bold text-stone-100">{label}</div>
                    <div className="text-[10px] text-stone-500">{hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-stone-500">
              Resolves {uniqueIds.toLocaleString()} printings via Scryfall (~{etaSec}s, rate-limited
              and cached). Keep this tab open.
            </p>
            {error && <p className="text-xs text-rose-400">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setStage("pick")}
                className="rounded-md bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-700"
              >
                ← Choose another file
              </button>
              <button
                onClick={() => void run()}
                className="rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
              >
                Import {mode === "replace" ? "(replace)" : "(merge)"}
              </button>
            </div>
          </div>
        )}

        {stage === "running" && (
          <div className="flex flex-col gap-3 py-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-800">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{
                  width: progress
                    ? `${(progress.resolved / Math.max(progress.total, 1)) * 100}%`
                    : "5%",
                }}
              />
            </div>
            <p className="text-center text-xs text-stone-400">
              {progress?.phase === "save"
                ? "Saving to your collection…"
                : progress
                  ? `Resolving printings… ${progress.resolved.toLocaleString()}/${progress.total.toLocaleString()}`
                  : "Starting…"}
            </p>
          </div>
        )}

        {stage === "done" && result && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg bg-emerald-950/30 p-3 text-sm text-emerald-200">
              ✓ Imported {result.cards.toLocaleString()} cards ({result.added.toLocaleString()}{" "}
              stacks).
            </div>
            {(result.unresolvedIds > 0 || result.skippedRows > 0) && (
              <p className="text-[11px] text-amber-400">
                {result.unresolvedIds > 0 && `${result.unresolvedIds} printing(s) not found on Scryfall. `}
                {result.skippedRows > 0 && `${result.skippedRows} row(s) skipped (no name/ID).`}
              </p>
            )}
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
