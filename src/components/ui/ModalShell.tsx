"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { motion } from "framer-motion";

/**
 * THE modal. Every dialog/overlay in the app renders through this shell so
 * backdrop, panel chrome, entrance animation, Escape handling, and close
 * affordance are identical everywhere. Don't hand-roll `fixed inset-0` panels.
 *
 * - `size` picks the max width; `anchor="top"` for tall scrolling content
 *   (search results, card detail), "center" for short dialogs.
 * - `title` renders the standard header with a close button; omit it to
 *   provide your own header inside `children`.
 * - `zClass` raises stacked modals (detail over search over page = 80/90/95).
 */

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  "2xl": "max-w-6xl",
  /** Near-fullscreen — pair with an expand/minimize toggle. */
  full: "max-w-[97vw]",
} as const;

export function ModalShell({
  onClose,
  title,
  size = "md",
  anchor = "center",
  zClass = "z-[80]",
  panelClassName = "",
  children,
}: {
  onClose: () => void;
  /** Standard header with close button; omit to render your own header. */
  title?: React.ReactNode;
  size?: keyof typeof SIZES;
  anchor?: "center" | "top";
  zClass?: string;
  panelClassName?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 ${zClass} flex justify-center bg-black/70 p-4 backdrop-blur-sm ${
        anchor === "top" ? "items-start overflow-y-auto" : "items-center"
      }`}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className={`flex w-full flex-col rounded-xl border border-stone-700 bg-stone-950 shadow-2xl ${
          SIZES[size]
        } ${anchor === "top" ? "my-6" : "max-h-[88vh]"} ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
            <h2 className="min-w-0 flex-1 text-sm font-bold text-stone-200">{title}</h2>
            <button
              onClick={onClose}
              className="rounded px-2 py-0.5 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className={anchor === "center" ? "min-h-0 flex-1 overflow-y-auto p-4" : "p-4"}>
          {children}
        </div>
      </motion.div>
    </div>
  );
}
