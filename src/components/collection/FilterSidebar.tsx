"use client";

import { Crown } from "lucide-react";
import { isLand } from "@/types";
import type { CardSort } from "@/lib/cards/sort";
import {
  emptyFilters,
  filtersActive,
  type CardFilters,
} from "@/lib/cards/filters";
import {
  ColorModeSeg,
  ColorPicker,
  NumberFilter,
  RarityChips,
  SortSelect,
  TypeChips,
} from "@/components/cards/FilterControls";

// Filter logic lives in lib/cards/filters (shared by every filtering surface);
// re-exported here for older imports.
export {
  emptyFilters,
  filtersActive,
  matchesFilters,
  canBeCommander,
  type CardFilters,
} from "@/lib/cards/filters";
export { isLand };

/** The collection/all-cards left rail: full filter set + sort. */
export function FilterSidebar({
  filters,
  onChange,
  sort,
  onSort,
  rarityMissing,
}: {
  filters: CardFilters;
  onChange: (f: CardFilters) => void;
  sort: CardSort;
  onSort: (s: CardSort) => void;
  /** True when no card has rarity data (older import) — show a re-sync hint. */
  rarityMissing?: boolean;
}) {
  const set = (patch: Partial<CardFilters>) => onChange({ ...filters, ...patch });
  const toggle = (key: "types" | "colors" | "rarities", value: string) => {
    const list = filters[key];
    set({ [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] } as Partial<CardFilters>);
  };

  return (
    <div className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-stone-800 bg-stone-950 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold tracking-wide text-stone-300 uppercase">Filters</span>
        {filtersActive(filters) && (
          <button
            onClick={() => onChange(emptyFilters())}
            className="text-[11px] text-stone-500 hover:text-rose-400"
          >
            Clear
          </button>
        )}
      </div>

      <div>
        <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">Name</div>
        <input
          value={filters.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Card name…"
          className="w-full rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-xs outline-none focus:border-emerald-600"
        />
      </div>

      <button
        onClick={() => set({ commanderOnly: !filters.commanderOnly })}
        className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold transition ${
          filters.commanderOnly
            ? "bg-amber-700 text-white"
            : "border border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800"
        }`}
        title="Only legendary creatures / cards that can be your commander"
      >
        <Crown size={13} className="inline align-[-2px]" /> Can be commander
      </button>

      <div>
        <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">Oracle text</div>
        <input
          value={filters.text}
          onChange={(e) => set({ text: e.target.value })}
          placeholder="e.g. draw a card"
          className="w-full rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-xs outline-none focus:border-emerald-600"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">Color</span>
          <ColorModeSeg value={filters.colorMode} onChange={(colorMode) => set({ colorMode })} />
        </div>
        <ColorPicker selected={filters.colors} onToggle={(c) => toggle("colors", c)} />
      </div>

      <div>
        <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">Type</div>
        <TypeChips selected={filters.types} onToggle={(t) => toggle("types", t)} />
      </div>

      <NumberFilter
        label="Mana value"
        op={filters.mvOp}
        value={filters.mv}
        onOp={(mvOp) => set({ mvOp })}
        onValue={(mv) => set({ mv })}
      />
      <NumberFilter
        label="Power"
        op={filters.powerOp}
        value={filters.power}
        onOp={(powerOp) => set({ powerOp })}
        onValue={(power) => set({ power })}
      />
      <NumberFilter
        label="Toughness"
        op={filters.toughnessOp}
        value={filters.toughness}
        onOp={(toughnessOp) => set({ toughnessOp })}
        onValue={(toughness) => set({ toughness })}
      />

      <div>
        <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
          Price (USD)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-stone-500">$</span>
          <input
            value={filters.priceMin}
            onChange={(e) => set({ priceMin: e.target.value })}
            placeholder="min"
            inputMode="decimal"
            className="w-full rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-xs outline-none focus:border-emerald-600"
          />
          <span className="text-stone-600">–</span>
          <span className="text-xs text-stone-500">$</span>
          <input
            value={filters.priceMax}
            onChange={(e) => set({ priceMax: e.target.value })}
            placeholder="max"
            inputMode="decimal"
            className="w-full rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-xs outline-none focus:border-emerald-600"
          />
        </div>
        <p className="mt-1 text-[10px] text-stone-600">Nonfoil market price (TCGplayer).</p>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">Rarity</div>
        <RarityChips selected={filters.rarities} onToggle={(r) => toggle("rarities", r)} />
        {rarityMissing && (
          <p className="mt-1 text-[10px] leading-snug text-amber-500/80">
            No rarity data on these cards yet. Sync/re-sync the card database on “My decks,” then
            reload — older imports get backfilled automatically.
          </p>
        )}
      </div>

      <div>
        <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">Sort</div>
        <SortSelect value={sort} onChange={(s) => onSort(s as CardSort)} />
      </div>
    </div>
  );
}
