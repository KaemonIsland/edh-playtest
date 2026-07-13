"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface TokenOption {
  /** Stored/searched value (e.g. a set code "mh3" or a type "Aura"). */
  value: string;
  /** Display label (defaults to value). */
  label?: string;
  /** Secondary hint shown on the right of a row (e.g. set release year). */
  hint?: string;
}

/**
 * Scryfall-style filter-as-you-type multi-select: selected values render as
 * removable chips; typing filters the option list into a dropdown; click or
 * Enter adds. With `allowCustom`, anything typed can be added even if it isn't
 * in the list (used for open-ended subtypes).
 */
export function TokenMultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  allowCustom = false,
  onSubmit,
}: {
  options: TokenOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  allowCustom?: boolean;
  /** Fired on Enter when the query is empty (e.g. run the search). */
  onSubmit?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const byValue = useMemo(
    () => new Map(options.map((o) => [o.value.toLowerCase(), o])),
    [options],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = new Set(selected.map((s) => s.toLowerCase()));
    const pool = options.filter((o) => !chosen.has(o.value.toLowerCase()));
    if (!q) return pool.slice(0, 50);
    const starts: TokenOption[] = [];
    const contains: TokenOption[] = [];
    for (const o of pool) {
      const hay = `${o.value} ${o.label ?? ""}`.toLowerCase();
      if (o.value.toLowerCase().startsWith(q) || (o.label ?? "").toLowerCase().startsWith(q))
        starts.push(o);
      else if (hay.includes(q)) contains.push(o);
    }
    return [...starts, ...contains].slice(0, 50);
  }, [query, options, selected]);

  useEffect(() => setActive(0), [query]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const add = (value: string) => {
    const v = value.trim();
    if (!v) return;
    if (!selected.some((s) => s.toLowerCase() === v.toLowerCase())) onChange([...selected, v]);
    setQuery("");
    setActive(0);
  };

  const remove = (value: string) =>
    onChange(selected.filter((s) => s.toLowerCase() !== value.toLowerCase()));

  const labelFor = (value: string) => byValue.get(value.toLowerCase())?.label ?? value;

  return (
    <div ref={rootRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1 rounded-md border border-stone-700 bg-stone-900 px-1.5 py-1 focus-within:border-emerald-600"
        onClick={() => setOpen(true)}
      >
        {selected.map((s) => (
          <span
            key={s}
            className="flex items-center gap-1 rounded bg-emerald-800/80 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-50"
          >
            {labelFor(s)}
            <button
              onClick={(e) => {
                e.stopPropagation();
                remove(s);
              }}
              className="text-emerald-200 hover:text-white"
              aria-label={`Remove ${labelFor(s)}`}
            >
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const pick = matches[active];
              if (pick) add(pick.value);
              else if (allowCustom && query.trim()) add(query);
              else if (!query.trim()) onSubmit?.();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Backspace" && !query && selected.length) {
              remove(selected[selected.length - 1]!);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={selected.length ? "" : placeholder}
          className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-xs text-stone-200 outline-none placeholder-stone-600"
        />
      </div>

      {open && (matches.length > 0 || (allowCustom && query.trim())) && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-stone-700 bg-stone-900 py-1 shadow-2xl">
          {matches.map((o, i) => (
            <button
              key={o.value}
              onMouseEnter={() => setActive(i)}
              onClick={() => add(o.value)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                i === active ? "bg-stone-800 text-white" : "text-stone-300"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{o.label ?? o.value}</span>
              {o.hint && <span className="shrink-0 text-[10px] text-stone-500">{o.hint}</span>}
            </button>
          ))}
          {allowCustom &&
            query.trim() &&
            !matches.some((o) => o.value.toLowerCase() === query.trim().toLowerCase()) && (
              <button
                onClick={() => add(query)}
                className="block w-full border-t border-stone-800 px-3 py-1.5 text-left text-[11px] font-semibold text-sky-400 hover:bg-stone-800"
              >
                Add “{query.trim()}”
              </button>
            )}
        </div>
      )}
    </div>
  );
}
