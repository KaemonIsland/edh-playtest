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

  return (
    <Modal title="Settings">
      <div className="flex flex-col gap-2">
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
