"use client";

/**
 * THE segmented control. Any "pick one of a few modes" toggle (view modes,
 * scopes, tabs, sort modes, comparison ops) renders through this so sizing,
 * radius, and active states match everywhere. Don't hand-roll
 * `rounded-lg bg-stone-900 p-0.5` button rows.
 *
 * Accent conventions: default (stone) for neutral mode switches; "emerald"
 * for the Collection scope; "amber" for ownership-ish toggles.
 */

export interface SegOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
  /** Per-option active accent (e.g. Collection scope is emerald). */
  accent?: "stone" | "emerald" | "amber";
}

const ACTIVE: Record<string, string> = {
  stone: "bg-stone-700 text-white",
  emerald: "bg-emerald-800 text-white",
  amber: "bg-amber-700 text-white",
};

export function Seg<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  className = "",
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "xs" | "sm";
  className?: string;
}) {
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2.5 py-1 text-[11px]";
  return (
    <div className={`flex gap-0.5 rounded-lg bg-stone-900 p-0.5 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          title={o.title}
          className={`rounded-md font-semibold whitespace-nowrap transition ${pad} ${
            value === o.value
              ? ACTIVE[o.accent ?? "stone"]
              : "text-stone-500 hover:text-stone-300"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
