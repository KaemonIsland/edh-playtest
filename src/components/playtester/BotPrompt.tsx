"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "@/lib/game/store";
import { useBotStore } from "@/lib/game/botStore";
import { useUiStore } from "@/lib/game/uiStore";
import { CardImage } from "@/components/cards/CardImage";

/** The "bot needs you" hand-off: blocks bot progress until acknowledged. */
export function BotPrompt() {
  const pending = useBotStore((s) => s.pending);
  const resolvePending = useBotStore((s) => s.resolvePending);
  const dismissPending = useBotStore((s) => s.dismissPending);
  const g = useGameStore();
  const setPreview = useUiStore((s) => s.setPreview);

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -30, opacity: 0 }}
          transition={{ type: "spring", stiffness: 360, damping: 30 }}
          className="fixed top-14 left-1/2 z-[70] w-[min(520px,92vw)] -translate-x-1/2 rounded-xl border border-rose-700/60 bg-stone-950/97 p-3 shadow-2xl backdrop-blur"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg">🤖</span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold tracking-wide text-rose-400 uppercase">
                Opponent needs you
              </div>
              <p className="mt-0.5 text-xs leading-snug text-stone-200">{pending.message}</p>
              {pending.kind === "resolve-spell" && (
                <div
                  className="mt-2 inline-block"
                  onMouseEnter={() => {
                    const inst = g.instances[pending.instanceId];
                    if (inst)
                      setPreview({ card: g.cards[inst.cardId], flipped: inst.flipped });
                  }}
                  onMouseLeave={() => setPreview(null)}
                >
                  <CardImage
                    card={g.cards[g.instances[pending.instanceId]?.cardId ?? ""]}
                    className="h-[98px] w-[70px] ring-1 ring-rose-800"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={dismissPending}
              className="rounded-md bg-stone-800 px-3 py-1.5 text-[11px] font-semibold text-stone-300 hover:bg-stone-700"
              title="Clear the prompt and arrange things yourself via drag / right-click"
            >
              I'll handle it manually
            </button>
            <button
              onClick={resolvePending}
              className="rounded-md bg-rose-700 px-4 py-1.5 text-[11px] font-bold text-white hover:bg-rose-600"
            >
              {pending.kind === "resolve-spell" && !pending.isPermanent
                ? "Resolved → graveyard"
                : "Continue"}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
