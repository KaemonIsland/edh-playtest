"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Deck } from "@/types";
import { exportDecklist, type ExportFormat } from "@/lib/deck/export";
import { saveCurrentDeck } from "@/lib/deck/storage";
import { downloadTextFile, fileSlug } from "@/lib/download";
import { useGameStore } from "@/lib/game/store";
import { getRepo } from "@/lib/repo";

export function ShareBar({ deck }: { deck: Deck }) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);

  const flash = (what: string) => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(window.location.href).catch(() => {});
    flash("url");
  };

  const copyExport = async (format: ExportFormat) => {
    await navigator.clipboard.writeText(exportDecklist(deck, format)).catch(() => {});
    flash(format);
  };

  const downloadExport = (format: ExportFormat) => {
    downloadTextFile(`${fileSlug(deck.name)}.${format}.txt`, exportDecklist(deck, format));
  };

  const playtest = () => {
    saveCurrentDeck(deck);
    useGameStore.getState().loadDeck(deck);
    router.push("/play");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={playtest}
        className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-600"
      >
        ▶ Playtest this deck
      </button>
      <button
        onClick={() => void copyUrl()}
        className="rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-xs font-semibold text-stone-200 hover:bg-stone-800"
      >
        {copied === "url" ? "✓ Copied!" : "🔗 Copy link"}
      </button>
      <div className="flex items-center gap-1 rounded-md border border-stone-700 bg-stone-900 px-2 py-1">
        <span className="text-[10px] text-stone-500 uppercase">Export</span>
        {(
          [
            ["plain", "Text"],
            ["archidekt", "Archidekt"],
            ["moxfield", "Moxfield"],
          ] as const
        ).map(([format, label]) => (
          <span key={format} className="flex items-center">
            <button
              onClick={() => void copyExport(format)}
              className="rounded px-2 py-1 text-[11px] font-semibold text-stone-300 hover:bg-stone-800"
              title={`Copy ${label} list`}
            >
              {copied === format ? "✓" : label}
            </button>
            <button
              onClick={() => downloadExport(format)}
              className="rounded px-1 py-1 text-[11px] text-stone-500 hover:bg-stone-800 hover:text-stone-200"
              title={`Download ${label} .txt`}
            >
              ↓
            </button>
          </span>
        ))}
      </div>
      {getRepo().mode !== "supabase" && (
        <span className="text-[10px] text-stone-600">
          Local mode — link works on this machine; add Supabase keys for public sharing.
        </span>
      )}
    </div>
  );
}
