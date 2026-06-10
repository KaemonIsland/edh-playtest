"use client";

import { useEffect, useState } from "react";
import {
  KEYBIND_DEFS,
  defaultKeybinds,
  loadKeybinds,
  saveKeybinds,
  type KeybindAction,
  type KeybindMap,
} from "@/lib/game/keybinds";
import { Modal } from "./Modal";

export function KeybindsPanel({ onChange }: { onChange: (map: KeybindMap) => void }) {
  const [binds, setBinds] = useState<KeybindMap>(defaultKeybinds);
  const [rebinding, setRebinding] = useState<KeybindAction | null>(null);

  useEffect(() => {
    setBinds(loadKeybinds());
  }, []);

  useEffect(() => {
    if (!rebinding) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRebinding(null);
        return;
      }
      const next = { ...binds, [rebinding]: e.key.toLowerCase() };
      setBinds(next);
      saveKeybinds(next);
      onChange(next);
      setRebinding(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [rebinding, binds, onChange]);

  return (
    <Modal title="Keybinds">
      <p className="mb-3 text-[11px] text-stone-500">
        Click a key to rebind it, then press the new key. Esc cancels.
      </p>
      <div className="flex flex-col gap-1">
        {KEYBIND_DEFS.map((def) => (
          <div
            key={def.action}
            className="flex items-center justify-between rounded-md bg-stone-900 px-3 py-2"
          >
            <span className="text-xs text-stone-300">{def.label}</span>
            <button
              onClick={() => setRebinding(def.action)}
              className={`min-w-10 rounded-md border px-2 py-1 text-center font-mono text-xs font-bold transition ${
                rebinding === def.action
                  ? "animate-pulse border-emerald-500 bg-emerald-900/40 text-emerald-300"
                  : "border-stone-700 bg-stone-800 text-stone-200 hover:border-stone-500"
              }`}
            >
              {rebinding === def.action ? "…" : binds[def.action]}
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => {
          const d = defaultKeybinds();
          setBinds(d);
          saveKeybinds(d);
          onChange(d);
        }}
        className="mt-3 rounded-md bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-700"
      >
        Reset to defaults
      </button>
    </Modal>
  );
}
