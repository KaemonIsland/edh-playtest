'use client'

import { useEffect, useState } from 'react'

/**
 * Global card size. Card grids across the app use the shared CARD_GRID class,
 * which sizes tiles off the `--card-min` CSS variable; this header dropdown
 * sets that variable (persisted). One knob, every grid follows.
 */

const KEY = 'edh-playtest:card-size'

// Small stays legible (title + mana readable) — sizes step up from there.
export const CARD_SIZES = {
  s: { label: 'Small', px: 185 },
  m: { label: 'Medium', px: 220 },
  l: { label: 'Large', px: 245 },
  xl: { label: 'X-Large', px: 305 },
} as const

export type CardSizeKey = keyof typeof CARD_SIZES

/** THE card grid: auto-fills columns at the user's chosen card size. */
export const CARD_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(var(--card-min,195px),1fr))] gap-3'

const CHANGE_EVENT = 'edh:card-size'

function apply(size: CardSizeKey) {
  document.documentElement.style.setProperty('--card-min', `${CARD_SIZES[size].px}px`)
  window.dispatchEvent(new CustomEvent<number>(CHANGE_EVENT, { detail: CARD_SIZES[size].px }))
}

/**
 * The current card size in px, live — for JS-computed layouts (the builder's
 * masonry columns) that can't read the CSS variable. CSS grids should use
 * CARD_GRID instead.
 */
export function useCardMinPx(): number {
  const [px, setPx] = useState<number>(CARD_SIZES.m.px)
  useEffect(() => {
    setPx(CARD_SIZES[getCardSize()].px)
    const onChange = (e: Event) => setPx((e as CustomEvent<number>).detail)
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [])
  return px
}

export function getCardSize(): CardSizeKey {
  try {
    const raw = window.localStorage.getItem(KEY) as CardSizeKey | null
    return raw && raw in CARD_SIZES ? raw : 'm'
  } catch {
    return 'm'
  }
}

/** Header dropdown; also applies the persisted size on first mount. */
export function CardSizeSelect() {
  const [size, setSize] = useState<CardSizeKey>('m')

  useEffect(() => {
    const saved = getCardSize()
    setSize(saved)
    apply(saved)
  }, [])

  const change = (next: CardSizeKey) => {
    setSize(next)
    apply(next)
    try {
      window.localStorage.setItem(KEY, next)
    } catch {
      // ignore
    }
  }

  return (
    <select
      value={size}
      onChange={(e) => change(e.target.value as CardSizeKey)}
      title="Card size — how big cards render in every grid"
      className="rounded-md border border-stone-800 bg-stone-950 px-1.5 py-1 text-[11px] text-stone-400 outline-none hover:border-stone-600 focus:border-emerald-600"
    >
      {(Object.keys(CARD_SIZES) as CardSizeKey[]).map((k) => (
        <option key={k} value={k}>
          Cards: {CARD_SIZES[k].label}
        </option>
      ))}
    </select>
  )
}
