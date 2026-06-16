"use client";

import { useEffect, useMemo, useState } from "react";
import type { Deck } from "@/types";
import { includedEntries } from "@/types";
import { getRepo } from "@/lib/repo";

/** How much of the deck the user owns, and what's missing (by oracle id). */
export function CollectionCoverage({ deck }: { deck: Deck }) {
  const [ownedByOracle, setOwnedByOracle] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    void getRepo()
      .listCollection()
      .then((cards) => {
        const m = new Map<string, number>();
        for (const c of cards) m.set(c.oracleId, (m.get(c.oracleId) ?? 0) + c.quantity);
        setOwnedByOracle(m);
      });
  }, []);

  const report = useMemo(() => {
    if (!ownedByOracle) return null;
    // Aggregate needed quantity by oracle id (commanders + included entries).
    const needed = new Map<string, { name: string; qty: number }>();
    const add = (oracleId: string, name: string, qty: number) => {
      const cur = needed.get(oracleId) ?? { name, qty: 0 };
      cur.qty += qty;
      needed.set(oracleId, cur);
    };
    for (const c of deck.commanders) add(c.oracle_id, c.name, 1);
    for (const e of includedEntries(deck)) {
      if (e.isCommander) continue;
      add(e.card.oracle_id, e.card.name, e.quantity);
    }

    let ownedCount = 0;
    let neededCount = 0;
    const missing: { name: string; need: number; have: number }[] = [];
    for (const [oracleId, { name, qty }] of needed) {
      const have = ownedByOracle.get(oracleId) ?? 0;
      neededCount += qty;
      ownedCount += Math.min(have, qty);
      if (have < qty) missing.push({ name, need: qty, have });
    }
    missing.sort((a, b) => a.name.localeCompare(b.name));
    return { ownedCount, neededCount, missing };
  }, [ownedByOracle, deck]);

  if (!report) return <p className="text-xs text-stone-600">Checking your collection…</p>;

  const pct = report.neededCount > 0 ? Math.round((report.ownedCount / report.neededCount) * 100) : 0;

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-800">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-xs font-bold text-stone-200">
          {report.ownedCount}/{report.neededCount} owned ({pct}%)
        </span>
      </div>
      {report.missing.length === 0 ? (
        <p className="text-xs text-emerald-400">You own every card in this deck. 🎉</p>
      ) : (
        <div>
          <div className="mb-1 text-[10px] font-bold tracking-wide text-stone-500 uppercase">
            Missing ({report.missing.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {report.missing.map((m) => (
              <span
                key={m.name}
                className="rounded bg-stone-900 px-2 py-0.5 text-[11px] text-stone-300"
                title={`Own ${m.have} of ${m.need}`}
              >
                {m.name}
                {m.need > 1 && <span className="text-stone-600"> ×{m.need - m.have}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
