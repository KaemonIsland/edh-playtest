"use client";

import { useEffect, useMemo, useState } from "react";
import type { Deck, ScryCard } from "@/types";
import { includedEntries } from "@/types";
import { getRepo } from "@/lib/repo";
import { addManyToWishlist } from "@/lib/cards/wishlist";
import { loadPriceIndex, priceOf, usePriceStore } from "@/lib/cards/pricing";

interface MissingCard {
  oracleId: string;
  name: string;
  need: number;
  have: number;
  card: ScryCard;
  proxy: boolean;
  unitPrice: number | null;
}

/** Collection coverage + buy-list: what you own, what's missing, and the cost
 * to finish (proxied cards excluded from the buy total). */
export function CollectionCoverage({ deck }: { deck: Deck }) {
  const [ownedByOracle, setOwnedByOracle] = useState<Map<string, number> | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const priceSource = usePriceStore((s) => s.source);
  const priceVersion = usePriceStore((s) => s.version);

  useEffect(() => {
    void loadPriceIndex();
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
    const needed = new Map<string, { name: string; qty: number; card: ScryCard; proxy: boolean }>();
    const add = (card: ScryCard, qty: number, proxy: boolean) => {
      const cur = needed.get(card.oracle_id) ?? { name: card.name, qty: 0, card, proxy: false };
      cur.qty += qty;
      cur.proxy = cur.proxy || proxy;
      needed.set(card.oracle_id, cur);
    };
    for (const c of deck.commanders) add(c, 1, false);
    for (const e of includedEntries(deck)) {
      if (e.isCommander) continue;
      add(e.card, e.quantity, e.proxy ?? false);
    }

    let ownedCount = 0;
    let neededCount = 0;
    const missing: MissingCard[] = [];
    for (const [oracleId, { name, qty, card, proxy }] of needed) {
      const have = ownedByOracle.get(oracleId) ?? 0;
      neededCount += qty;
      ownedCount += Math.min(have, qty);
      if (have < qty) {
        missing.push({
          oracleId,
          name,
          need: qty,
          have,
          card,
          proxy,
          unitPrice: priceOf(card, "nonfoil"),
        });
      }
    }
    missing.sort((a, b) => a.name.localeCompare(b.name));

    // Buy cost excludes cards you're proxying.
    let buyCost = 0;
    let buyCount = 0;
    for (const m of missing) {
      if (m.proxy) continue;
      const shortfall = m.need - m.have;
      buyCount += shortfall;
      if (m.unitPrice !== null) buyCost += m.unitPrice * shortfall;
    }
    return { ownedCount, neededCount, missing, buyCost, buyCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedByOracle, deck, priceSource, priceVersion]);

  if (!report) return <p className="text-xs text-stone-600">Checking your collection…</p>;

  const pct = report.neededCount > 0 ? Math.round((report.ownedCount / report.neededCount) * 100) : 0;
  const toBuy = report.missing.filter((m) => !m.proxy);

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
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">
              Missing ({report.missing.length})
            </span>
            <span className="rounded bg-stone-900 px-2 py-0.5 text-[11px] text-stone-300">
              Cost to finish:{" "}
              <span className="font-bold text-emerald-400">${report.buyCost.toFixed(2)}</span>
              <span className="text-stone-600"> · {report.buyCount} to buy</span>
            </span>
            {toBuy.length > 0 && (
              <button
                onClick={async () => {
                  const n = await addManyToWishlist(
                    toBuy.map((m) => ({ card: m.card, quantity: m.need })),
                  );
                  setAdded(`Added ${n} card${n === 1 ? "" : "s"} to your wishlist.`);
                }}
                className="rounded-md bg-amber-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-600"
              >
                ⭐ Add missing to wishlist
              </button>
            )}
            {added && <span className="text-[11px] text-emerald-400">{added}</span>}
          </div>
          <p className="mb-1 text-[10px] text-stone-600">
            Proxied cards (marked in a card’s “In decks” tab) are excluded from the buy total.
          </p>
          <div className="flex flex-wrap gap-1">
            {report.missing.map((m) => (
              <span
                key={m.oracleId}
                className={`rounded px-2 py-0.5 text-[11px] ${
                  m.proxy ? "bg-stone-900/60 text-stone-500 line-through" : "bg-stone-900 text-stone-300"
                }`}
                title={
                  m.proxy
                    ? "Proxied — not counted in the buy total"
                    : `Own ${m.have} of ${m.need}${m.unitPrice !== null ? ` · $${m.unitPrice.toFixed(2)} each` : ""}`
                }
              >
                {m.name}
                {m.need - m.have > 1 && <span className="text-stone-600"> ×{m.need - m.have}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
