"use client";

import { motion } from "framer-motion";
import { useUiStore } from "@/lib/game/uiStore";

export function Modal({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const closeModal = useUiStore((s) => s.closeModal);
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={closeModal}
      onKeyDown={(e) => e.key === "Escape" && closeModal()}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className={`flex max-h-[85vh] w-full flex-col rounded-xl border border-stone-700 bg-stone-950 shadow-2xl ${
          wide ? "max-w-4xl" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
          <h2 className="text-sm font-bold text-stone-200">{title}</h2>
          <button
            onClick={closeModal}
            className="rounded px-2 py-0.5 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </motion.div>
    </div>
  );
}
