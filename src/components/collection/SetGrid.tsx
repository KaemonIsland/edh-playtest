"use client";

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/cards/sets";

export interface SetGridItem {
  code: string;
  name: string;
  released?: string;
  icon?: string;
  /** Scryfall set_type (expansion, commander, core, masters, …). */
  type?: string;
  /** Main stat, e.g. "150 cards" or "34/150 cards". */
  primary: string;
  /** Optional right-aligned secondary stat, e.g. "$120". */
  secondary?: string;
}

type SetSort = "newest" | "oldest" | "name";

function typeLabel(t: string): string {
  return t
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Unified grid of set tiles with name/code filter, sort, and type filter —
 * shared by Collection and All Cards so "sets" look the same everywhere. */
export function SetGrid({
  items,
  onSelect,
  loading,
}: {
  items: SetGridItem[];
  onSelect: (code: string, name: string) => void;
  loading?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SetSort>("newest");
  const [type, setType] = useState("");

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const s of items) if (s.type) set.add(s.type);
    return [...set].sort();
  }, [items]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = items.filter((s) => {
      if (type && s.type !== type) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.code.toLowerCase().includes(q)) return false;
      return true;
    });
    list = [...list];
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "oldest")
      list.sort((a, b) => (a.released ?? "").localeCompare(b.released ?? ""));
    else list.sort((a, b) => (b.released ?? "").localeCompare(a.released ?? ""));
    return list;
  }, [items, filter, sort, type]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter sets by name or code…"
          className="w-64 rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
        />
        <div className="flex items-center gap-1">
          <span className="text-[10px] tracking-wide text-stone-500 uppercase">Sort</span>
          <div className="flex gap-0.5 rounded-lg bg-stone-900 p-0.5">
            {(
              [
                ["newest", "Newest"],
                ["oldest", "Oldest"],
                ["name", "A–Z"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                  sort === k ? "bg-stone-700 text-white" : "text-stone-500 hover:text-stone-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {types.length > 1 && (
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-xs outline-none focus:border-emerald-600"
            title="Filter by set type"
          >
            <option value="">All types ({types.length})</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto text-[11px] text-stone-500">{visible.length} sets</span>
      </div>

      {loading ? (
        <p className="text-sm text-stone-600">Loading sets…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-stone-600">No sets match.</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <button
              key={s.code}
              onClick={() => onSelect(s.code, s.name)}
              className="flex items-center gap-3 rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-left transition hover:border-stone-600 hover:bg-stone-900"
            >
              {s.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.icon}
                  alt=""
                  className="h-6 w-6 shrink-0 opacity-90 invert"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
                />
              ) : (
                <span className="h-6 w-6 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-stone-200">{s.name}</div>
                <div className="text-[10px] text-stone-500">
                  {s.code.toUpperCase()}
                  {s.released ? ` · ${formatDate(s.released)}` : ""}
                  {s.type ? ` · ${typeLabel(s.type)}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-bold text-stone-300">{s.primary}</div>
                {s.secondary && <div className="text-[10px] text-emerald-400">{s.secondary}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
