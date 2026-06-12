"use client";

import { useState } from "react";
import type { Deck } from "@/types";
import { computeDeckStats, PIP_COLORS, type PipColor } from "@/lib/deck/stats";

const PIP_STYLE: Record<PipColor, string> = {
  W: "bg-amber-100",
  U: "bg-sky-500",
  B: "bg-stone-500",
  R: "bg-red-500",
  G: "bg-green-500",
};

function RoleStat({ label, names, target }: { label: string; names: string[]; target: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md bg-stone-900 p-2.5">
      <button onClick={() => setOpen(!open)} className="flex w-full items-baseline justify-between text-left">
        <span className="text-xs font-semibold text-stone-300">{label}</span>
        <span className="text-lg font-bold text-stone-100">
          {names.length}
          <span className="ml-1 text-[10px] font-normal text-stone-500">/ {target}</span>
        </span>
      </button>
      {open && (
        <div className="mt-1.5 max-h-32 overflow-y-auto text-[11px] leading-snug text-stone-500">
          {names.length > 0 ? names.join(", ") : "None detected."}
        </div>
      )}
    </div>
  );
}

export function StatsPanel({ deck }: { deck: Deck }) {
  const stats = computeDeckStats(deck);
  const maxCurve = Math.max(1, ...stats.curve.map((c) => c.count));
  const landOk =
    stats.landCount >= stats.recommendedLands[0] && stats.landCount <= stats.recommendedLands[1];

  return (
    <section className="rounded-xl border border-stone-800 bg-stone-950 p-4">
      <h2 className="mb-3 text-sm font-bold tracking-wide text-stone-200 uppercase">Deck stats</h2>

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

        {/* Pips vs sources */}
        <div>
          <h3 className="mb-2 text-xs font-semibold text-stone-400">
            Color pips vs. mana sources
          </h3>
          <div className="flex flex-col gap-1.5">
            {stats.colorBalance.map((b) => (
              <div key={b.color} className="flex items-center gap-2 text-[11px]">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-stone-900 ${PIP_STYLE[b.color]}`}
                >
                  {b.color}
                </span>
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
              {stats.shortfalls.map((c) => ({ W: "white", U: "blue", B: "black", R: "red", G: "green" })[c]).join(", ")}{" "}
              relative to what the spells demand.
            </p>
          )}
        </div>
      </div>

      {/* Role counts + key numbers */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RoleStat label="Ramp" names={stats.ramp} target="10+" />
        <RoleStat label="Card draw" names={stats.draw} target="10+" />
        <RoleStat label="Interaction" names={stats.interaction} target="8+" />
        <RoleStat label="Tutors" names={stats.tutors} target="varies" />
      </div>

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
        <div className="rounded-md bg-stone-900 p-2.5" title="Scryfall USD prices where available">
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

      {/* keep the canonical pip order referenced so colors render consistently */}
      <span className="hidden">{PIP_COLORS.join("")}</span>
    </section>
  );
}
