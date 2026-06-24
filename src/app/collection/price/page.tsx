"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getRepo, type CollectionCard } from "@/lib/repo";
import {
  loadPriceIndex,
  usePriceStore,
  PRICE_SOURCE_LABEL,
  getPriceSyncStatus,
} from "@/lib/cards/pricing";
import {
  valueCopies,
  priceBreakdown,
  type CategoryRow,
} from "@/lib/cards/priceBreakdown";

const money0 = (n: number) => "$" + Math.round(n).toLocaleString();
const money2 = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CollectionPricePage() {
  const [cards, setCards] = useState<CollectionCard[] | null>(null);
  const [excludeUnder, setExcludeUnder] = useState("");
  const priceSource = usePriceStore((s) => s.source);
  const priceVersion = usePriceStore((s) => s.version);

  useEffect(() => {
    void loadPriceIndex();
    void getRepo().listCollection().then(setCards);
  }, []);

  const copies = useMemo(
    () => valueCopies(cards ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, priceSource, priceVersion],
  );

  const threshold = (() => {
    const n = parseFloat(excludeUnder);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();

  // Headlines are stable (full collection + a fixed $1 non-bulk cut); the
  // threshold input only reshapes the distribution / breakdown sections below.
  const market = useMemo(() => priceBreakdown(copies, 0), [copies]);
  const nonBulk = useMemo(() => priceBreakdown(copies, 1), [copies]);
  const b = useMemo(() => priceBreakdown(copies, threshold), [copies, threshold]);

  const maxBucketValue = Math.max(1, ...b.buckets.map((x) => x.value));
  const synced = getPriceSyncStatus().syncedAt;

  return (
    <div className="min-h-dvh bg-[#08080a] text-stone-200">
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <nav className="mb-4 text-xs text-stone-400">
          <Link href="/collection" className="hover:text-white">← Collection</Link>
          <span className="ml-2 font-semibold text-stone-200">Price breakdown</span>
        </nav>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Collection value</h1>
            <p className="mt-0.5 text-sm text-stone-500">
              How your collection&apos;s value is distributed — and what it&apos;s really worth past the bulk.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-xs">
              <span className="text-stone-400">Ignore cards under $</span>
              <input
                value={excludeUnder}
                onChange={(e) => setExcludeUnder(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="w-12 bg-transparent text-right outline-none placeholder:text-stone-600"
              />
            </label>
            <Link
              href="/settings"
              title="Change price source in Settings"
              className="rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-800"
            >
              {PRICE_SOURCE_LABEL[priceSource]} ⚙
            </Link>
          </div>
        </div>

        {cards === null ? (
          <p className="text-sm text-stone-600">Loading…</p>
        ) : copies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-800 p-10 text-center text-sm text-stone-500">
            Your collection is empty. Add cards on the{" "}
            <Link href="/collection" className="text-emerald-400 hover:underline">Collection</Link> page.
          </div>
        ) : (
          <>
            {/* Headline valuations */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Card
                label={`Market value (${PRICE_SOURCE_LABEL[priceSource]})`}
                value={money0(market.totalValue)}
                sub={`${market.totalCards.toLocaleString()} priced cards`}
                accent
              />
              <Card
                label="Non-bulk value (≥ $1)"
                value={money0(nonBulk.totalValue)}
                sub={`${nonBulk.excludedCards.toLocaleString()} bulk cards excluded`}
              />
              <Card
                label="Median card"
                value={money2(market.medianUnit)}
                sub="half your cards are worth less"
              />
              <Card label="Mean card" value={money2(market.meanUnit)} sub="average per copy" />
            </div>

            {market.unpricedCards > 0 && (
              <p className="mt-2 text-[11px] text-stone-600">
                {market.unpricedCards.toLocaleString()} card(s) have no {PRICE_SOURCE_LABEL[priceSource]} price
                {synced ? "" : " — sync prices on the My decks page for accurate values"} and are excluded from totals.
              </p>
            )}

            {/* Distribution */}
            <Section
              title="Value distribution"
              hint={
                threshold > 0
                  ? `≥ $${threshold} only — ${b.excludedCards.toLocaleString()} cheaper card(s) hidden`
                  : "copies grouped by individual price"
              }
            >
              <div className="space-y-1.5">
                {b.buckets.map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-right text-xs text-stone-400">{row.label}</span>
                    <div className="relative h-6 flex-1 overflow-hidden rounded bg-stone-900">
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-emerald-800/60"
                        style={{ width: `${(row.value / maxBucketValue) * 100}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-between px-2 text-[11px]">
                        <span className="font-semibold text-stone-200">
                          {row.count.toLocaleString()} card{row.count === 1 ? "" : "s"}
                        </span>
                        <span className="text-stone-400">{money0(row.value)}</span>
                      </div>
                    </div>
                    <span className="w-10 shrink-0 text-right text-[10px] text-stone-600">
                      {b.totalValue > 0 ? `${Math.round((row.value / b.totalValue) * 100)}%` : "0%"}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Color + type breakdowns */}
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <Section title="By color">
                <CategoryTable rows={b.byColor} total={b.totalValue} />
              </Section>
              <Section title="By type">
                <CategoryTable rows={b.byType} total={b.totalValue} />
              </Section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-2.5">
      <div className="text-[10px] tracking-wide text-stone-500 uppercase">{label}</div>
      <div className={`mt-0.5 text-xl font-bold ${accent ? "text-emerald-300" : "text-stone-100"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-stone-600">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-bold tracking-wide text-stone-300 uppercase">{title}</h2>
        {hint && <span className="text-[10px] text-stone-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function CategoryTable<K extends string>({
  rows,
  total,
}: {
  rows: CategoryRow<K>[];
  total: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-xs text-stone-600">No cards.</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs text-stone-400">{r.label}</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-stone-900">
            <div
              className="absolute inset-y-0 left-0 rounded bg-stone-700"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px]">
              <span className="text-stone-300">{r.count.toLocaleString()}</span>
              <span className="font-semibold text-stone-200">{money0(r.value)}</span>
            </div>
          </div>
          <span className="w-9 shrink-0 text-right text-[10px] text-stone-600">
            {total > 0 ? `${Math.round((r.value / total) * 100)}%` : "0%"}
          </span>
        </div>
      ))}
    </div>
  );
}

