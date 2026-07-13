# EDH Playtest — codebase guide

A Magic: The Gathering Commander toolbox (Next.js 15 / React 19 / Tailwind 4 / Zustand / Dexie),
desktop-only, dark-theme-only. Four sections that must feel like ONE app:
**Collection** (`/collection`), **All Cards** (`/cards`), **Decks** (`/decks`, `/d/[id]`,
`/d/[id]/edit`), **Playtest** (`/import`, `/play`).

## The rule

**Before you build ANY new UI, check the component inventory below.** If something similar
exists, use or extend it — never fork it. New reusable pieces go in `src/components/ui/`
(generic) or `src/components/cards/` (card-specific) and get a row in this file. The app
previously accumulated near-duplicate mini-UIs; that is the failure mode to avoid.

## Component inventory (use these, don't reinvent)

| Need | Use | Where |
| --- | --- | --- |
| Any dialog / overlay | `ModalShell` (sizes sm–2xl + `full`, `anchor="top"` for tall content, `zClass` to stack) | `src/components/ui/ModalShell.tsx` |
| A grid of cards | `CARD_GRID` class constant — sizes tiles from the global card-size setting | `src/components/ui/CardSizeSelect.tsx` |
| Pick-one toggle (tabs, view modes, scopes, ops) | `Seg` | `src/components/ui/Seg.tsx` |
| A card in a grid/list (image, owned badge, prices, steppers) | `PrintingTile` (has `badge` + `footer` slots for custom overlays/actions) | `src/components/collection/PrintingTile.tsx` |
| A deck entry row/stack (builder + dock boards) | `CardRow` / `StackCard` / `TextRow` | `src/components/builder/CardRows.tsx` |
| Raw card image (faces, tokens, card back) | `CardImage` | `src/components/cards/CardImage.tsx` |
| Mana cost / symbols | `ManaCost` (SVGs in `/public/mana`) | `src/components/cards/ManaCost.tsx` |
| Color pips picker, color-mode toggle | `ColorPicker`, `ColorModeSeg` | `src/components/cards/FilterControls.tsx` |
| Type / rarity filter chips | `TypeChips` (emerald active), `RarityChips` (amber active) | `src/components/cards/FilterControls.tsx` |
| Numeric filter (=, ≥, ≤ + value) | `NumberFilter` | `src/components/cards/FilterControls.tsx` |
| Sort dropdown for card lists | `SortSelect` | `src/components/cards/FilterControls.tsx` |
| Full filter rail (collection/all-cards pages) | `FilterSidebar` | `src/components/collection/FilterSidebar.tsx` |
| Multi-select with typeahead (sets, types) | `TokenMultiSelect` | `src/components/collection/TokenMultiSelect.tsx` |
| Card detail (categories, printings, swaps, rulings, in-decks) | `CardDetailModal` — THE depth view; open it on card click everywhere | `src/components/builder/CardDetailModal.tsx` |
| Full card search (filters + otags + scope) | `CardSearchModal` (`initialFilters`/`initialScope`/`autoRun` for presets like Browse collection) | `src/components/builder/CardSearchModal.tsx` |
| Card discovery (otags, EDHREC synergy) | `SuggestionsModal` | `src/components/builder/SuggestionsModal.tsx` |
| Builder side panel (skeleton/stats/history/boards) | `DeckDock` | `src/components/builder/DeckDock.tsx` |
| Playtester dialog | `Modal` (wraps ModalShell, wired to game UI store) | `src/components/playtester/modals/Modal.tsx` |

## Hard conventions

- **Sorting card lists**: ALWAYS `cardComparator` from `src/lib/cards/sort.ts`, default
  `"color"` — mono W→U→B→R→G, then multicolor (by color count, then WUBRG combination),
  colorless, lands; cmc then name within groups. Every card list gets a `SortSelect`.
- **Filtering cards**: the ONE filter model is `CardFilters` + `matchesFilters` in
  `src/lib/cards/filters.ts`. Extend it; never invent a parallel filter shape.
- **Icons**: lucide-react ONLY. **Never emojis** (the user explicitly hates them). Data-driven
  icons (`MenuItem.icon`, `CounterDef.icon`) are typed `LucideIcon`. Inline in text buttons:
  `<Icon size={13} className="inline align-[-2px]" />`.
- **Card click = open `CardDetailModal`. Card drag = move/categorize.** Never break this split
  (dnd-kit `PointerSensor` with `activationConstraint: { distance: 6 }`).
- **Collection-first**: search/browse defaults to the user's collection (`SearchScope` in
  `src/lib/cards/smartSearch.ts`); adding a card with Collection scope uses the printing they
  own (`preferOwnedPrinting`), not the newest release.
- **Multi-face cards** (MDFC/adventure/split/room): classify by front face
  (`frontTypeLine`/`typeGroup`), but land counts include any land face (`hasLandFace`).
- New deck entries set `addedAt: Date.now()` (powers "New considering").
- **Card grids**: always `className={CARD_GRID}` (auto-fill columns off the `--card-min` CSS
  variable). The header's `CardSizeSelect` sets that variable globally — never hardcode
  `grid-cols-N` for card tiles.
- **Desktop-first width**: browsing pages (Collection, All Cards) are full-width (`px-6`, no
  max-w); modals that show many cards should offer the Maximize2/Minimize2 expand toggle
  (see CardSearchModal) using ModalShell's `full` size.

## Color semantics (Tailwind stone dark theme, bg `#08080a`)

- **emerald** — primary action, confirm, "in collection" scope, category names
- **amber** — ownership (owned badges/borders), commander accents, warnings, rarity chips
- **sky** — info, playtest actions, secondary-category chips, hover rings
- **rose** — danger/remove/cuts
- **violet** — swaps/bench
- **fuchsia** — playtester counters/dice
- Panels: `bg-stone-950` + `border-stone-800` (hover `-700`); inputs
  `border-stone-700 bg-stone-900 … focus:border-emerald-600`; section labels
  `text-[10px] font-bold tracking-wide text-stone-500 uppercase`.

## Data layer map

- `src/types/index.ts` — `ScryCard`, `Deck`, `DeckEntry` (categories[0] = premier), game types.
- `src/lib/repo/` — persistence (`getRepo()`): decks, versions (with `snapshot`), games,
  collection, wishlist. Postgres via `/api/db` or Supabase; Dexie is legacy/migration.
- `src/lib/cards/carddb.ts` — local oracle DB (MTGJSON sync) + `advancedSearchCards`;
  `smartSearch.ts` — omnibox search, scopes, owned-printing preference;
  `otags.ts` — Scryfall syntax detection, curated tags, `CATEGORY_OTAG`;
  `suggest.ts` — EDHREC suggestions + bulk name resolution; `pricing.ts` — price index.
- `src/lib/deck/stats.ts` — deck math: `computeDeckStats`, `computeOdds` (counts every
  category on a card), `groupEntriesByLens` (builder lenses incl. ghost mode),
  `computeSkeleton`, `typeTally`. `versions.ts` — snapshot/diff/restore.
- Scryfall calls go through `src/lib/scryfall/server.ts` (rate-limited server proxy);
  `otag:` queries ride `/api/cards/search`. EDHREC via `/api/edhrec` (`mode=cards` = synergy).
- MTGJSON-synced cards have NO `produced_mana`/`prices` — stats derives mana production from
  text; prices come from the MTGJSON price index (`priceOf`), never `card.prices` directly.

## Verify

`npm run typecheck` and `npm run build` must pass. Dev: `npm run dev`.
