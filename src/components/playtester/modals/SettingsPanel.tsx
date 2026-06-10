"use client";

import { useGameStore } from "@/lib/game/store";
import { Modal } from "./Modal";

export function SettingsPanel() {
  const prefs = useGameStore((s) => s.prefs);
  const setPref = useGameStore((s) => s.setPref);

  const Toggle = ({
    label,
    hint,
    value,
    onChange,
  }: {
    label: string;
    hint: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-3 rounded-md bg-stone-900 px-3 py-2.5 text-left hover:bg-stone-800/80"
    >
      <span>
        <span className="block text-xs font-semibold text-stone-200">{label}</span>
        <span className="block text-[10px] text-stone-500">{hint}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${value ? "bg-emerald-600" : "bg-stone-700"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${value ? "left-4.5" : "left-0.5"}`}
        />
      </span>
    </button>
  );

  const SIZE_PRESETS = [
    { label: "Small", value: 80 },
    { label: "Default", value: 100 },
    { label: "Large", value: 120 },
    { label: "X-Large", value: 145 },
  ];

  return (
    <Modal title="Settings">
      <div className="flex flex-col gap-2">
        <div className="rounded-md bg-stone-900 px-3 py-2.5">
          <div className="text-xs font-semibold text-stone-200">Card size</div>
          <div className="mb-2 text-[10px] text-stone-500">
            Adjust the table's card size to what's comfortable for you.
          </div>
          <div className="flex items-center gap-2">
            {SIZE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPref("cardSize", p.value)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  prefs.cardSize === p.value
                    ? "bg-emerald-700 text-white"
                    : "bg-stone-800 text-stone-400 hover:bg-stone-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="range"
              min={70}
              max={160}
              step={5}
              value={prefs.cardSize}
              onChange={(e) => setPref("cardSize", parseInt(e.target.value, 10))}
              className="w-full accent-emerald-600"
              aria-label="Card size"
            />
            <span className="w-12 text-right font-mono text-xs text-stone-400">
              {prefs.cardSize}px
            </span>
          </div>
        </div>
        <Toggle
          label="Draw on next turn"
          hint="“Next turn” untaps everything and draws a card for turn."
          value={prefs.drawOnTurn}
          onChange={(v) => setPref("drawOnTurn", v)}
        />
        <Toggle
          label="Snap battlefield cards to grid"
          hint="Dropped cards align to a 20px grid."
          value={prefs.snapToGrid}
          onChange={(v) => setPref("snapToGrid", v)}
        />
        <Toggle
          label="Phase stepper"
          hint="Show Untap → Upkeep → Draw → Main → Combat → Main 2 → End in the top bar (user-advanced, never enforced)."
          value={prefs.showPhaseStepper}
          onChange={(v) => setPref("showPhaseStepper", v)}
        />
      </div>
    </Modal>
  );
}
