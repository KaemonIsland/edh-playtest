"use client";

import { useMemo, useState } from "react";
import type { Deck, RoleOverrides } from "@/types";
import { includedEntries, isLand } from "@/types";
import {
  computeDeckStats,
  computeOdds,
  type PipColor,
  type Role,
} from "@/lib/deck/stats";

const PIP_STYLE: Record<PipColor, string> = {
  W: "bg-amber-100",
  U: "bg-sky-500",
  B: "bg-stone-500",
  R: "bg-red-500",
  G: "bg-green-500",
};

const ROLE_LABEL: Record<Role, string> = {
  ramp: "Ramp",
  draw: "Card draw",
  interaction: "Interaction",
  tutors: "Tutors",
};

/** Searchable checklist for correcting an auto-detected role bucket. */
function RoleEditModal({
  deck,
  role,
  current,
  onClose,
  onSave,
}: {
  deck: Deck;
  role: Role;
  current: string[];
  onClose: () => void;
  onSave: (names: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(current));

  const candidates = useMemo(() => {
    const names = includedEntries(deck)
      .filter((e) => !e.isCommander && !isLand(e.card.type_line))
      .map((e) => e.card.name)
      .sort((a, b) => a.localeCompare(b));
    const q = query.trim().toLowerCase();
    return q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
  }, [deck, query]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-stone-700 bg-stone-950 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-sm font-bold text-stone-200">
          Edit “{ROLE_LABEL[role]}” cards ({selected.size})
        </h3>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter cards…"
          className="mb-2 rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
        />
        <div className="flex-1 overflow-y-auto">
          {candidates.map((name) => (
            <label
              key={name}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-stone-300 hover:bg-stone-900"
            >
              <input
                type="checkbox"
                checked={selected.has(name)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(name);
                  else next.delete(name);
                  setSelected(next);
                }}
                className="accent-emerald-600"
              />
              {name}
            </label>
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-700">
            Cancel
          </button>
          <button
            onClick={() => onSave([...selected])}
            className="rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function StatsPanel({
  deck,
  onUpdateDeck,
}: {
  deck: Deck;
  onUpdateDeck?: (deck: Deck) => void;
}) {
  const stats = useMemo(() => computeDeckStats(deck), [deck]);
  const odds = useMemo(() => computeOdds(deck), [deck]);
  const [openRole, setOpenRole] = useState<Role | null>(null);
  const [expandedRole, setExpandedRole] = useState<Role | null>(null);
  const [oddsTab, setOddsTab] = useState<"categories" | "types">("categories");
  const maxCurve = Math.max(1, ...stats.curve.map((c) => c.count));
  const landOk =
    stats.landCount >= stats.recommendedLands[0] && stats.landCount <= stats.recommendedLands[1];

  const saveRole = (role: Role, names: string[]) => {
    // Persist as add/remove deltas against the auto-detection.
    const auto = new Set(stats.autoRoles[role]);
    const chosen = new Set(names);
    const overrides: RoleOverrides = {
      ...deck.roleOverrides,
      [role]: {
        add: names.filter((n) => !auto.has(n)),
        remove: [...auto].filter((n) => !chosen.has(n)),
      },
    };
    onUpdateDeck?.({ ...deck, roleOverrides: overrides });
    setOpenRole(null);
  };

  const hasOverride = (role: Role) =>
    (deck.roleOverrides?.[role]?.add.length ?? 0) > 0 ||
    (deck.roleOverrides?.[role]?.remove.length ?? 0) > 0;

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Mana curve */}
        <div>
          <h3 className="mb-2 text-xs font-semibold text-stone-400">
            Mana curve <span className="text-stone-600">(avg {stats.avgCmc.toFixed(2)})</span>
          </h3>
          <div className="flex h-28 items-end gap-1.5">
            {stats.curve.map((b) => (
              <div key={b.cmc} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-stone-500">{b.count || ""}</span>
                <div
                  className="w-full rounded-t bg-emerald-700"
                  style={{ height: `${(b.count / maxCurve) * 80}px` }}
                />
                <span className="text-[10px] text-stone-500">{b.cmc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pips vs sources — commander identity colors only */}
        <div>
          <h3 className="mb-2 text-xs font-semibold text-stone-400">
            Color pips vs. mana sources{" "}
            <span className="text-stone-600">(commander identity only)</span>
          </h3>
          <div className="flex flex-col gap-1.5">
            {stats.colorBalance.map((b) => (
              <div key={b.color} className="flex items-center gap-2 text-[11px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/mana/${b.color}.svg`} alt={b.color} className="h-5 w-5 shrink-0" />
                <div className="flex-1">
                  <div className="flex h-2 overflow-hidden rounded bg-stone-800">
                    <div className={PIP_STYLE[b.color]} style={{ width: `${b.pipShare * 100}%` }} />
                  </div>
                  <div className="mt-0.5 flex h-2 overflow-hidden rounded bg-stone-800">
                    <div
                      className={`${PIP_STYLE[b.color]} opacity-50`}
                      style={{ width: `${b.sourceShare * 100}%` }}
                    />
                  </div>
                </div>
                <span className="w-28 shrink-0 text-right text-stone-500">
                  {b.pips} pips · {b.sources} src ({b.landSources} lands)
                </span>
                {b.shortfall && (
                  <span className="shrink-0 rounded bg-rose-900/60 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">
                    SHORT
                  </span>
                )}
              </div>
            ))}
            {stats.colorBalance.length === 0 && (
              <span className="text-[11px] text-stone-600">Colorless deck.</span>
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-stone-600">
            Top bar = share of colored pips in costs; bottom = share of sources producing it.
          </p>
          {stats.shortfalls.length > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-rose-400">
              ⚠ The mana base looks light on{" "}
              {stats.shortfalls
                .map((c) => ({ W: "white", U: "blue", B: "black", R: "red", G: "green" })[c])
                .join(", ")}{" "}
              relative to what the spells demand.
            </p>
          )}
        </div>
      </div>

      {/* Roles: auto-detected, user-correctable */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
          <div key={role} className="rounded-md bg-stone-900 p-2.5">
            <div className="flex items-baseline justify-between">
              <button
                onClick={() => setExpandedRole(expandedRole === role ? null : role)}
                className="text-left text-xs font-semibold text-stone-300"
              >
                {ROLE_LABEL[role]}{" "}
                <span
                  className={`ml-1 rounded px-1 py-0.5 text-[8px] font-bold tracking-wide uppercase ${
                    hasOverride(role)
                      ? "bg-emerald-900/70 text-emerald-300"
                      : "bg-stone-800 text-stone-500"
                  }`}
                  title={
                    hasOverride(role)
                      ? "Auto-detected with your manual corrections"
                      : "Auto-detected from card text — click ✎ to correct"
                  }
                >
                  {hasOverride(role) ? "edited" : "auto"}
                </span>
              </button>
              <span className="text-lg font-bold text-stone-100">{stats.roles[role].length}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              {onUpdateDeck && (
                <button
                  onClick={() => setOpenRole(role)}
                  className="text-[10px] text-stone-500 hover:text-stone-300"
                >
                  ✎ Edit list
                </button>
              )}
              <button
                onClick={() => setExpandedRole(expandedRole === role ? null : role)}
                className="text-[10px] text-stone-600 hover:text-stone-400"
              >
                {expandedRole === role ? "hide" : "show"}
              </button>
            </div>
            {expandedRole === role && (
              <div className="mt-1 max-h-32 overflow-y-auto text-[11px] leading-snug text-stone-500">
                {stats.roles[role].length > 0 ? stats.roles[role].join(", ") : "None detected."}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Key numbers */}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-md bg-stone-900 p-2.5">
          <div className="text-xs font-semibold text-stone-300">Lands</div>
          <div className={`text-lg font-bold ${landOk ? "text-stone-100" : "text-amber-400"}`}>
            {stats.landCount}
            <span className="ml-1 text-[10px] font-normal text-stone-500">
              / rec. {stats.recommendedLands[0]}–{stats.recommendedLands[1]}
            </span>
          </div>
        </div>
        <div className="rounded-md bg-stone-900 p-2.5">
          <div className="text-xs font-semibold text-stone-300">Cards</div>
          <div className="text-lg font-bold text-stone-100">{stats.cardCount}</div>
        </div>
        <div
          className="rounded-md bg-stone-900 p-2.5"
          title="Rough estimate: commander CMC, accelerated ~1 turn per 6 ramp pieces"
        >
          <div className="text-xs font-semibold text-stone-300">Commander by turn</div>
          <div className="text-lg font-bold text-stone-100">
            {stats.expectedCommanderTurn !== null ? `~T${stats.expectedCommanderTurn}` : "—"}
          </div>
        </div>
        <div className="rounded-md bg-stone-900 p-2.5" title="Scryfall USD; honours category price settings">
          <div className="text-xs font-semibold text-stone-300">Est. price</div>
          <div className="text-lg font-bold text-stone-100">
            {stats.priceUsd !== null ? `$${stats.priceUsd.toFixed(0)}` : "—"}
            {stats.priceMissing > 0 && (
              <span className="ml-1 text-[10px] font-normal text-stone-600">
                ({stats.priceMissing} unpriced)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Opening-hand odds */}
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-xs font-semibold text-stone-400">Opening-hand odds (7 cards)</h3>
          <div className="flex gap-0.5 rounded-lg bg-stone-900 p-0.5">
            {(["categories", "types"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setOddsTab(tab)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize transition ${
                  oddsTab === tab ? "bg-stone-700 text-white" : "text-stone-500"
                }`}
              >
                {tab === "categories" ? "By category" : "By card type"}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-md border border-stone-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-stone-900 text-left text-[10px] tracking-wide text-stone-500 uppercase">
                <th className="px-3 py-1.5">{oddsTab === "categories" ? "Category" : "Type"}</th>
                <th className="px-3 py-1.5 text-right">Qty</th>
                <th className="px-3 py-1.5 text-right">≥1</th>
                <th className="px-3 py-1.5 text-right">≥2</th>
              </tr>
            </thead>
            <tbody>
              {odds[oddsTab].map((row) => (
                <tr key={row.label} className="border-t border-stone-900 text-stone-300">
                  <td className="px-3 py-1">{row.label}</td>
                  <td className="px-3 py-1 text-right text-stone-500">{row.qty}</td>
                  <td className="px-3 py-1 text-right font-semibold">
                    {Math.round(row.p1 * 100)}%
                  </td>
                  <td className="px-3 py-1 text-right text-stone-500">
                    {Math.round(row.p2 * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openRole && (
        <RoleEditModal
          deck={deck}
          role={openRole}
          current={stats.roles[openRole]}
          onClose={() => setOpenRole(null)}
          onSave={(names) => saveRole(openRole, names)}
        />
      )}
    </div>
  );
}
