"use client";

import type { ScryCard } from "@/types";
import { isLand } from "@/types";
import type { CardSort } from "@/lib/cards/sort";
import type { NumOp } from "@/lib/cards/carddb";

const COLORS = ["W", "U", "B", "R", "G", "C"] as const;
const RARITIES = ["common", "uncommon", "rare", "mythic"] as const;
const TYPES = [
  "Creature",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Planeswalker",
  "Battle",
  "Land",
] as const;

export interface CardFilters {
  name: string;
  types: string[];
  colors: string[];
  colorMode: "any" | "exact" | "identity";
  mvOp: NumOp;
  mv: string;
  powerOp: NumOp;
  power: string;
  toughnessOp: NumOp;
  toughness: string;
  rarities: string[];
  text: string;
  /** Only cards that can be a commander (legendary creature / "can be your commander"). */
  commanderOnly: boolean;
  /** USD price bounds (nonfoil), as strings; "" = unbounded. */
  priceMin: string;
  priceMax: string;
}

export function emptyFilters(): CardFilters {
  return {
    name: "",
    types: [],
    colors: [],
    colorMode: "any",
    mvOp: ">=",
    mv: "",
    powerOp: ">=",
    power: "",
    toughnessOp: ">=",
    toughness: "",
    rarities: [],
    text: "",
    commanderOnly: false,
    priceMin: "",
    priceMax: "",
  };
}

/** Heuristic for "can be a commander": legendary creature or rules text. */
export function canBeCommander(card: ScryCard): boolean {
  const tl = card.type_line.toLowerCase();
  if (tl.includes("legendary") && tl.includes("creature")) return true;
  const text =
    card.oracle_text ?? card.card_faces?.map((f) => f.oracle_text ?? "").join("\n") ?? "";
  return /can be your commander/i.test(text);
}

export function filtersActive(f: CardFilters): boolean {
  return Boolean(
    f.name ||
      f.text ||
      f.types.length ||
      f.colors.length ||
      f.mv ||
      f.power ||
      f.toughness ||
      f.rarities.length ||
      f.commanderOnly ||
      f.priceMin ||
      f.priceMax,
  );
}

function cmp(value: number, op: NumOp, target: number): boolean {
  if (op === "=") return value === target;
  if (op === ">=") return value >= target;
  return value <= target;
}

/** Client-side predicate matching a card against the filter set. */
export function matchesFilters(card: ScryCard, f: CardFilters): boolean {
  if (f.name && !card.name.toLowerCase().includes(f.name.toLowerCase())) return false;
  if (f.text) {
    const o = card.oracle_text ?? card.card_faces?.map((x) => x.oracle_text ?? "").join("\n") ?? "";
    if (!o.toLowerCase().includes(f.text.toLowerCase())) return false;
  }
  if (f.types.length) {
    const tl = card.type_line.toLowerCase();
    if (!f.types.every((t) => tl.includes(t.toLowerCase()))) return false;
  }
  if (f.colors.length) {
    const cc = card.colors ?? [];
    if (f.colorMode === "identity") {
      if (!card.color_identity.every((x) => f.colors.includes(x))) return false;
    } else if (f.colorMode === "exact") {
      const want = f.colors.filter((c) => c !== "C");
      if (f.colors.includes("C")) {
        if (cc.length !== 0) return false;
      } else if (cc.length !== want.length || !want.every((x) => cc.includes(x))) return false;
    } else {
      // any
      if (f.colors.includes("C") && cc.length === 0) {
        /* colorless matches */
      } else if (!cc.some((x) => f.colors.includes(x))) return false;
    }
  }
  const num = (raw: string | undefined): number | null => {
    const n = parseFloat(raw ?? "");
    return Number.isFinite(n) ? n : null;
  };
  if (f.mv.trim()) {
    const t = parseFloat(f.mv);
    if (Number.isFinite(t) && !cmp(card.cmc, f.mvOp, t)) return false;
  }
  if (f.power.trim()) {
    const t = parseFloat(f.power);
    const p = num(card.power);
    if (Number.isFinite(t) && (p === null || !cmp(p, f.powerOp, t))) return false;
  }
  if (f.toughness.trim()) {
    const t = parseFloat(f.toughness);
    const tg = num(card.toughness);
    if (Number.isFinite(t) && (tg === null || !cmp(tg, f.toughnessOp, t))) return false;
  }
  if (f.rarities.length && !f.rarities.includes((card.rarity ?? "").toLowerCase())) return false;
  if (f.commanderOnly && !canBeCommander(card)) return false;
  if (f.priceMin.trim() || f.priceMax.trim()) {
    // Filter on the card's nonfoil USD price; unknown prices fail any bound.
    const price = num(card.prices?.usd ?? undefined);
    const min = parseFloat(f.priceMin);
    const max = parseFloat(f.priceMax);
    if (Number.isFinite(min) && (price === null || price < min)) return false;
    if (Number.isFinite(max) && (price === null || price > max)) return false;
  }
  return true;
}

const OPS: NumOp[] = ["=", ">=", "<="];

function NumberFilter({
  label,
  op,
  value,
  onOp,
  onValue,
}: {
  label: string;
  op: NumOp;
  value: string;
  onOp: (op: NumOp) => void;
  onValue: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">{label}</div>
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
          placeholder="—"
          inputMode="numeric"
          className="w-16 rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-xs outline-none focus:border-emerald-600"
        />
      </div>
    </div>
  );
}

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
        👑 Can be commander
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
          <div className="flex gap-0.5 rounded-md bg-stone-900 p-0.5">
            {(["any", "exact", "identity"] as const).map((m) => (
              <button
                key={m}
                onClick={() => set({ colorMode: m })}
                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold capitalize ${
                  filters.colorMode === m ? "bg-stone-700 text-white" : "text-stone-500"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => toggle("colors", c)}
              className={`rounded-full p-0.5 transition ${
                filters.colors.includes(c) ? "ring-2 ring-emerald-400" : "opacity-50 hover:opacity-90"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/mana/${c}.svg`} alt={c} className="h-6 w-6" />
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">Type</div>
        <div className="flex flex-wrap gap-1">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => toggle("types", t)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                filters.types.includes(t)
                  ? "bg-emerald-700 text-white"
                  : "bg-stone-900 text-stone-400 hover:text-stone-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
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
        <div className="flex flex-wrap gap-1">
          {RARITIES.map((r) => (
            <button
              key={r}
              onClick={() => toggle("rarities", r)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize transition ${
                filters.rarities.includes(r)
                  ? "bg-amber-700 text-white"
                  : "bg-stone-900 text-stone-400 hover:text-stone-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {rarityMissing && (
          <p className="mt-1 text-[10px] leading-snug text-amber-500/80">
            No rarity data on these cards yet. Sync/re-sync the card database on “My decks,” then
            reload — older imports get backfilled automatically.
          </p>
        )}
      </div>

      <div>
        <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">Sort</div>
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as CardSort)}
          className="w-full rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-xs outline-none focus:border-emerald-600"
        >
          <option value="color">Color (default)</option>
          <option value="newest">Newest set</option>
          <option value="name">Name</option>
          <option value="cmc">Mana value</option>
          <option value="value">Price (high → low)</option>
          <option value="value-asc">Price (low → high)</option>
        </select>
      </div>
    </div>
  );
}

export { isLand };
