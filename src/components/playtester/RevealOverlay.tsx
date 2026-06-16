"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { CardImage } from "@/components/cards/CardImage";

/** Shows the revealed top-of-library card centered until dismissed. */
export function RevealOverlay() {
  const revealedId = useUiStore((s) => s.revealedInstanceId);
  const setRevealed = useUiStore((s) => s.setRevealed);
  const inst = useGameStore((s) => (revealedId ? s.instances[revealedId] : undefined));
  const card = useGameStore((s) => (inst ? s.cards[inst.cardId] : undefined));

  return (
    <AnimatePresence>
      {revealedId && inst && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[85] flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm"
          onClick={() => setRevealed(null)}
        >
          <div className="text-xs font-bold tracking-wide text-stone-400 uppercase">
            Top of library
          </div>
          <motion.div
            initial={{ scale: 0.8, rotateY: 90 }}
            animate={{ scale: 1, rotateY: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <CardImage
              card={card}
              tokenSpec={inst.tokenSpec}
              flipped={inst.flipped}
              className="w-72 drop-shadow-2xl"
            />
          </motion.div>
          <button
            onClick={() => setRevealed(null)}
            className="rounded-md bg-stone-800 px-4 py-1.5 text-xs font-semibold text-stone-200 hover:bg-stone-700"
          >
            Close (it stays on top)
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
