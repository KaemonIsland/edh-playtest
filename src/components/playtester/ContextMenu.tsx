"use client";

import { useEffect, useRef } from "react";
import { useUiStore } from "@/lib/game/uiStore";

export function ContextMenu() {
  const menu = useUiStore((s) => s.menu);
  const closeMenu = useUiStore((s) => s.closeMenu);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, closeMenu]);

  if (!menu) return null;

  // Keep the menu on-screen.
  const maxX = typeof window !== "undefined" ? window.innerWidth - 230 : menu.x;
  const maxY = typeof window !== "undefined" ? window.innerHeight - menu.items.length * 30 - 20 : menu.y;

  return (
    <div
      ref={ref}
      className="fixed z-[90] min-w-[210px] rounded-lg border border-stone-700 bg-stone-900/98 py-1 shadow-2xl backdrop-blur"
      style={{ left: Math.min(menu.x, maxX), top: Math.min(menu.y, Math.max(maxY, 8)) }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) =>
        item.separator ? (
          <div key={i} className="my-1 border-t border-stone-800" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => {
              closeMenu();
              item.onClick?.();
            }}
            className={`block w-full px-3 py-1.5 text-left text-xs transition hover:bg-stone-800 disabled:opacity-40 ${
              item.danger ? "text-rose-400" : "text-stone-200"
            }`}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
