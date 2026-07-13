"use client";

import type { NumOp } from "@/lib/cards/carddb";
import type { CardSort } from "@/lib/cards/sort";
import { FILTER_COLORS, FILTER_RARITIES, FILTER_TYPES } from "@/lib/cards/filters";
import { Seg } from "@/components/ui/Seg";

/**
 * THE card-filter controls. Every surface that filters cards renders these
 * (collection sidebar, deck search modal, suggestions) so chips, pips, and
 * number filters look and behave identically. Conventions:
 * - Type chips: emerald when active. Rarity chips: amber when active.
 * - Color pips: mana SVGs with an emerald ring when selected.
 * - Sorting: SortSelect, defaulting to canonical color order (lib/cards/sort).
 */

export function ColorPicker({
  selected,
  onToggle,
  colors = FILTER_COLORS as readonly string[],
  size = 6,
}: {
  selected: string[];
  onToggle: (color: string) => void;
  /** Restrict shown pips (e.g. commander identity only). */
  colors?: readonly string[];
  /** Tailwind h-/w- unit (6 = 24px, 4 = 16px). */
  size?: 4 | 5 | 6;
}) {
  const dim = size === 4 ? "h-4 w-4" : size === 5 ? "h-5 w-5" : "h-6 w-6";
  return (
    <div className="flex gap-1">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onToggle(c)}
          title={c}
          className={`rounded-full p-0.5 transition ${
            selected.includes(c) ? "ring-2 ring-emerald-400" : "opacity-50 hover:opacity-90"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/mana/${c}.svg`} alt={c} className={dim} />
        </button>
      ))}
    </div>
  );
}

export function ColorModeSeg({
  value,
  onChange,
}: {
  value: "any" | "exact" | "identity";
  onChange: (m: "any" | "exact" | "identity") => void;
}) {
  return (
    <Seg
      size="xs"
      value={value}
      onChange={onChange}
      options={[
        { value: "any", label: "Any", title: "Card has at least one selected color" },
        { value: "exact", label: "Exact", title: "Card is exactly these colors" },
        { value: "identity", label: "Identity", title: "Card fits within these colors" },
      ]}
    />
  );
}

export function TypeChips({
  selected,
  onToggle,
  types = FILTER_TYPES as readonly string[],
}: {
  selected: string[];
  onToggle: (type: string) => void;
  types?: readonly string[];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {types.map((t) => (
        <button
          key={t}
          onClick={() => onToggle(t)}
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
            selected.includes(t)
              ? "bg-emerald-700 text-white"
              : "bg-stone-900 text-stone-400 hover:text-stone-200"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function RarityChips({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (rarity: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {FILTER_RARITIES.map((r) => (
        <button
          key={r}
          onClick={() => onToggle(r)}
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize transition ${
            selected.includes(r)
              ? "bg-amber-700 text-white"
              : "bg-stone-900 text-stone-400 hover:text-stone-200"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

const OPS: NumOp[] = ["=", ">=", "<="];

export function NumberFilter({
  label,
  op,
  value,
  onOp,
  onValue,
  onSubmit,
  inline = false,
}: {
  label: string;
  op: NumOp;
  value: string;
  onOp: (op: NumOp) => void;
  onValue: (v: string) => void;
  onSubmit?: () => void;
  /** Label to the left (toolbars) instead of above (sidebars). */
  inline?: boolean;
}) {
  const controls = (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5 rounded-md bg-stone-900 p-0.5">
        {OPS.map((o) => (
          <button
            key={o}
            onClick={() => onOp(o)}
            className={`rounded px-1.5 py-1 font-mono text-[10px] font-bold ${
              op === o ? "bg-stone-700 text-white" : "text-stone-500"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
      <input
        value={value}
        onChange={(e) => onValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit?.()}
        placeholder="—"
        inputMode="numeric"
        className="w-16 rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-xs outline-none focus:border-emerald-600"
      />
    </div>
  );
  if (inline) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">
          {label}
        </span>
        {controls}
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
        {label}
      </div>
      {controls}
    </div>
  );
}

export const SORT_OPTIONS: { value: CardSort; label: string }[] = [
  { value: "color", label: "Color (default)" },
  { value: "newest", label: "Newest set" },
  { value: "name", label: "Name" },
  { value: "cmc", label: "Mana value" },
  { value: "value", label: "Price (high → low)" },
  { value: "value-asc", label: "Price (low → high)" },
];

export function SortSelect({
  value,
  onChange,
  compact = false,
  extra,
}: {
  value: string;
  onChange: (s: string) => void;
  compact?: boolean;
  /** Extra leading options (e.g. EDHREC synergy/popularity). */
  extra?: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border border-stone-700 bg-stone-900 text-xs outline-none focus:border-emerald-600 ${
        compact ? "px-1.5 py-1 text-[11px]" : "w-full px-2 py-1.5"
      }`}
      title="Sort order"
    >
      {(extra ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
