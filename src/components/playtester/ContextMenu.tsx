"use client";

import { useEffect, useRef, useState } from "react";
import { useUiStore, type MenuItem } from "@/lib/game/uiStore";

const MENU_W = 230;

function MenuList({
  items,
  onAction,
  depth = 0,
}: {
  items: MenuItem[];
  onAction: () => void;
  depth?: number;
}) {
  const [openSub, setOpenSub] = useState<number | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  return (
    <div
      className="min-w-[230px] rounded-lg border border-stone-700 bg-stone-900/98 py-1 shadow-2xl backdrop-blur"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.separator) return <div key={i} className="my-1 border-t border-stone-800" />;

        // Inline counter row: "+1/+1   − 3 +  🗑" — clicks keep the menu open.
        if (item.counter) {
          const c = item.counter;
          return (
            <div
              key={i}
              className="flex items-center gap-1 px-3 py-1 text-xs text-stone-200"
              onMouseEnter={() => setOpenSub(null)}
            >
              <span className="flex-1 truncate">{item.label}</span>
              <button
                onClick={c.onDec}
                className="flex h-6 w-6 items-center justify-center rounded text-stone-400 hover:bg-stone-700 hover:text-white"
                title={`Remove one ${item.label}`}
              >
                −
              </button>
              <span className="min-w-5 text-center font-bold">{c.count}</span>
              <button
                onClick={c.onInc}
                className="flex h-6 w-6 items-center justify-center rounded text-stone-400 hover:bg-stone-700 hover:text-white"
                title={`Add one ${item.label}`}
              >
                +
              </button>
              <button
                onClick={() => {
                  c.onRemove();
                }}
                className="ml-1 flex h-6 w-6 items-center justify-center rounded text-stone-500 hover:bg-stone-700 hover:text-rose-400"
                title={`Remove all ${item.label} counters`}
              >
                🗑
              </button>
            </div>
          );
        }

        const row = (
          <>
            <span className="w-5 text-center text-[11px] opacity-70">{item.icon ?? ""}</span>
            <span className="flex-1">{item.label}</span>
            {item.hint && <span className="text-[10px] text-stone-500">{item.hint}</span>}
            {item.children && <span className="text-stone-500">▸</span>}
          </>
        );

        if (item.children) {
          return (
            <div
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className="relative"
              onMouseEnter={() => setOpenSub(i)}
              onMouseLeave={() => setOpenSub((cur) => (cur === i ? null : cur))}
            >
              <button
                disabled={item.disabled}
                onClick={() => setOpenSub((cur) => (cur === i ? null : i))}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition hover:bg-stone-800 disabled:opacity-40 ${
                  item.danger ? "text-rose-400" : "text-stone-200"
                }`}
              >
                {row}
              </button>
              {openSub === i && (
                <SubMenuFlyout anchor={itemRefs.current[i] ?? null} depth={depth}>
                  <MenuList items={item.children} onAction={onAction} depth={depth + 1} />
                </SubMenuFlyout>
              )}
            </div>
          );
        }

        return (
          <button
            key={i}
            disabled={item.disabled}
            onMouseEnter={() => setOpenSub(null)}
            onClick={() => {
              onAction();
              item.onClick?.();
            }}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition hover:bg-stone-800 disabled:opacity-40 ${
              item.danger ? "text-rose-400" : "text-stone-200"
            }`}
          >
            {row}
          </button>
        );
      })}
    </div>
  );
}

/** Positions a submenu beside its parent item, flipping left if offscreen. */
function SubMenuFlyout({
  anchor,
  depth,
  children,
}: {
  anchor: HTMLDivElement | null;
  depth: number;
  children: React.ReactNode;
}) {
  const rect = anchor?.getBoundingClientRect();
  const flip = rect ? rect.right + MENU_W > window.innerWidth : false;
  return (
    <div
      className="absolute top-0 z-[95]"
      style={flip ? { right: "100%", marginRight: 2 } : { left: "100%", marginLeft: 2 }}
      data-depth={depth}
    >
      {children}
    </div>
  );
}

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

  // Keep the root menu on-screen.
  const maxX = typeof window !== "undefined" ? window.innerWidth - MENU_W - 12 : menu.x;
  const maxY =
    typeof window !== "undefined"
      ? window.innerHeight - Math.min(menu.items.length, 14) * 30 - 20
      : menu.y;

  return (
    <div
      ref={ref}
      className="fixed z-[90]"
      style={{ left: Math.min(menu.x, maxX), top: Math.min(menu.y, Math.max(maxY, 8)) }}
    >
      <MenuList items={menu.items} onAction={closeMenu} />
    </div>
  );
}
