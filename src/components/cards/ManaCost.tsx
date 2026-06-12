"use client";

import { memo } from "react";

/** Symbols we ship as local SVGs (downloaded from Scryfall into /public/mana). */
const KNOWN = new Set([
  "W","U","B","R","G","C","S","X","T","Q","E",
  "0","1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","20",
  "WU","WB","UB","UR","BR","BG","RG","RW","GW","GU",
  "WP","UP","BP","RP","GP","2W","2U","2B","2R","2G",
]);

function normalize(sym: string): string {
  return sym.toUpperCase().replace(/\//g, "");
}

/** Renders "{2}{G}{G}" as inline mana symbol SVGs (text chip fallback). */
export const ManaCost = memo(function ManaCost({
  cost,
  size = 14,
  className = "",
}: {
  cost?: string;
  size?: number;
  className?: string;
}) {
  if (!cost) return null;
  const symbols = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
  if (symbols.length === 0) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 align-middle ${className}`}>
      {symbols.map((sym, i) => {
        const key = normalize(sym);
        return KNOWN.has(key) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={`/mana/${key}.svg`}
            alt={`{${sym}}`}
            width={size}
            height={size}
            className="inline-block shrink-0"
          />
        ) : (
          <span
            key={i}
            style={{ width: size, height: size, fontSize: size * 0.6 }}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-stone-600 font-bold text-stone-100"
          >
            {sym}
          </span>
        );
      })}
    </span>
  );
});
