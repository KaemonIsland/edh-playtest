"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NotebookPen } from "lucide-react";
import { useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { getRepo } from "@/lib/repo";

/**
 * Scratch pad for playtest notes ("X underperformed", "try Y instead", play
 * lines…). Saved onto the deck itself (Deck.notes), so the builder's Notes
 * dock tab shows the same text while editing. Writes go to localStorage
 * immediately and to the repo debounced; if the deck was never saved, notes
 * live in localStorage until it is.
 */

const localKey = (deckId: string) => `edh-playtest:notes:${deckId}`;

export function NotesPanel() {
  const deck = useGameStore((s) => s.deck);
  const logOpen = useUiStore((s) => s.logOpen);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "local">("idle");
  const timer = useRef<number | null>(null);
  const loadedFor = useRef<string | null>(null);

  // Load once per deck: saved deck notes win, local scratch fills the gap.
  useEffect(() => {
    if (!deck || loadedFor.current === deck.id) return;
    loadedFor.current = deck.id;
    const local = (() => {
      try {
        return window.localStorage.getItem(localKey(deck.id));
      } catch {
        return null;
      }
    })();
    setText(local ?? deck.notes ?? "");
    void getRepo()
      .getDeck(deck.id)
      .then((d) => {
        if (d?.deck.notes && local === null) setText(d.deck.notes);
      })
      .catch(() => {});
  }, [deck]);

  const change = (value: string) => {
    setText(value);
    if (!deck) return;
    try {
      window.localStorage.setItem(localKey(deck.id), value);
    } catch {
      // ignore
    }
    setStatus("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const repo = getRepo();
        const full = await repo.getDeck(deck.id);
        if (!full) {
          setStatus("local");
          return;
        }
        await repo.saveDeck({ ...full.deck, notes: value });
        setStatus("saved");
      } catch {
        setStatus("local");
      }
    }, 900);
  };

  if (!deck) return null;

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="absolute top-10 left-2 z-30 flex items-center gap-1 rounded-md border border-stone-700 bg-stone-900/90 px-2.5 py-1 text-[11px] font-semibold text-stone-300 shadow hover:bg-stone-800"
        title="Playtest notes — saved to the deck, visible in the builder's Notes tab"
      >
        <NotebookPen size={11} />
        Notes
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className={`absolute top-[4.6rem] bottom-40 z-30 flex w-72 flex-col rounded-lg border border-stone-800 bg-stone-950/95 shadow-2xl backdrop-blur ${
              logOpen ? "left-[17.5rem]" : "left-2"
            }`}
          >
            <div className="flex items-center justify-between border-b border-stone-800 px-3 py-2">
              <span className="text-xs font-bold text-stone-300">Scratch pad</span>
              <span className="font-mono text-[9px] text-stone-600">
                {status === "saving"
                  ? "saving…"
                  : status === "saved"
                    ? "saved to deck"
                    : status === "local"
                      ? "saved locally (deck not saved yet)"
                      : ""}
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => change(e.target.value)}
              placeholder={
                "Notes while you play — they show up in the deck builder's Notes tab.\n\n" +
                "e.g.\n· Cultivate always dead in hand\n· Want a 3rd wipe\n· Try Ozolith here"
              }
              className="min-h-0 flex-1 resize-none bg-transparent p-3 text-xs leading-relaxed text-stone-200 outline-none placeholder:text-stone-600"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
