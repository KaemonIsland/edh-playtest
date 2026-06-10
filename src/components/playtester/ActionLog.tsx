"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";

/** Collapsible panel of typed log events (basis for Chunk-3 game tracking). */
export function ActionLog() {
  const log = useGameStore((s) => s.log);
  const open = useUiStore((s) => s.logOpen);
  const setOpen = useUiStore((s) => s.setLogOpen);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [log.length, open]);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="absolute top-2 left-2 z-30 rounded-md border border-stone-700 bg-stone-900/90 px-2.5 py-1 text-[11px] font-semibold text-stone-300 shadow hover:bg-stone-800"
        title="Toggle action log (l)"
      >
        Log {log.length > 0 && <span className="text-stone-500">({log.length})</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="absolute top-10 bottom-40 left-2 z-30 flex w-64 flex-col rounded-lg border border-stone-800 bg-stone-950/95 shadow-2xl backdrop-blur"
          >
            <div className="border-b border-stone-800 px-3 py-2 text-xs font-bold text-stone-300">
              Action log
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2">
              {log.length === 0 && <div className="text-[11px] text-stone-600">No actions yet.</div>}
              {log.map((entry) => (
                <div key={entry.id} className="mb-1.5 text-[11px] leading-snug text-stone-400">
                  <span className="mr-1 rounded bg-stone-800 px-1 text-[9px] text-stone-500">
                    T{entry.turn}
                  </span>
                  {entry.event.message}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
