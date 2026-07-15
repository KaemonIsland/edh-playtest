# Glitched Goblet Playtester

A local-first Magic: The Gathering / Commander (EDH) workshop: track your **collection**, build and
showcase **decks** (primers, stats, changelogs, game logs), **playtest** solo or against rules-based
bot opponents, and browse **all cards** by set to log what you open.

The whole app is built around one loop: **discover cards you already own → build the deck →
playtest it → take notes → update the list → know exactly what to change in paper.** It's
desktop-only, dark-only, and collection-first — search defaults to what you own, and adding a card
uses the printing in your binder, not the newest reprint.

Card data, prices, and rulings come from [MTGJSON](https://mtgjson.com); card images come from
[Scryfall](https://scryfall.com)'s CDN (reconstructed from each card's Scryfall id). Not affiliated
with Wizards of the Coast. Unofficial Fan Content permitted under the WotC Fan Content Policy.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Zustand · dnd-kit · Framer Motion · Dexie
(IndexedDB) · Postgres (or Supabase).

## Features

### Deck builder (`/d/[id]/edit`)

The centerpiece — a drag-and-drop workbench where click = card details, drag = move/categorize.

- **Two-tier header** — deck name, color identity, a manual **bracket** select, price, a 100-card
  **count ring**, and the deck's **pitch**: a one-sentence thesis that stays in view while you cut
  and add. A status chip shows **Theorycraft** vs **In paper** (with a live count of card changes
  not yet made physically).
- **Collection-first search** — an omnibox that speaks Scryfall syntax (`otag:ramp`, `o:"draw a
  card"`, `t:creature`, `cmc<=3`) with a Collection / All-cards scope toggle. Quick results are
  **drag sources**: drop one on a category column to add it there. Keyboard: `/` focuses search,
  `↑↓` pick, `↵` opens details, `⇧↵` quick-adds, `⌥↵` benches to Maybeboard.
- **Categories, plural** — every card can hold multiple categories (Ramp, Draw, Win Con…). Drag
  between columns to set the premier category; **Alt-drop adds a secondary** one. Shift-click
  multi-selects so a whole package moves in one drag.
- **Lenses & sorting** — group columns by Category, **Category (all)** (cards appear ghosted in
  every category they hold), Type, Curve, Color, or **Rarity**; sort within stacks by mana value,
  name, color, rarity (binder order: mythic→common, then WUBRG), or type. Stacks or text view.
- **The dock** — always-visible side panel:
  - **Skeleton**: editable category targets (35 lands, 10 draw…) with progress bars; counts every
    category on a card; click a row to hunt candidates for that slot.
  - **Stats**: mana curve, color pips vs. sources, price, and hypergeometric **opening-hand odds**.
  - **History**: every saved snapshot — **restore** any version into the editor, **compare** any
    two, take a snapshot on demand, and mark which version is **built in paper**.
  - **Notes**: the deck's scratch pad (also editable mid-playtest).
  - **Boards**: Maybeboard/Ideas pinned below, plus **New considering** — recent adds with images,
    draggable straight into the deck.
- **Suggestions** — two discovery engines: **Scryfall oracle tags** with combinable filters
  ("creatures that ramp", "blue draw spells ≤3 mv"), and **EDHREC sorted by synergy** (commander-
  specific tech first, not the same 20 staples every list runs). Both respect your collection scope
  and commander identity. **Browse collection** opens everything you own in the commander's colors.
- **Card detail modal** — quantity, commander toggle, categories, a printings grid (with an
  owned-only filter — click a printing to make it the deck's copy, ideal for showcase art),
  **Swaps** (bench alternatives behind a slot and swap them in later), In-decks usage, collection
  records + wishlist, rulings, and oracle text with real mana symbols.
- **Versions & branching** — "Save + snapshot" records a restorable version; **Clone** copies the
  whole deck (list, pitch, notes, targets) to branch a new spin.

### Paper-deck workflows

- **Changes** — a dual **Take out / Put in** pull list comparing the current list against any
  snapshot (defaults to the version marked as built). Card images in color order, click to check
  off at the table, copy as text. Boards never count — they don't exist in paper.
- **Build mode** — assembling a deck physically: every card gets a pull checkbox, a progress bar
  tracks 0→100, pulled cards tuck into the back of their stacks (or hide entirely), and the deck
  stays **fully editable** mid-build — a missing card becomes a real swap, no shadow copy to
  maintain. Pull state persists per deck. Finish with **Mark as built…**
- **Built-in-paper tracking** — a deck points at the exact version snapshot that's sleeved. Card
  usage everywhere distinguishes **IN PAPER** (physically tied up) / **NOT IN BUILD** (in the list,
  but the copy is free) / **THEORY** (just a list) so you know when to proxy vs. pull.

### Collection (`/collection`) & All Cards (`/cards`)

- Full-width browsing with the shared filter rail (name, text, color + any/exact/identity, types,
  mana value, power/toughness, price range, rarity, commander-only) and canonical color sorting.
- **CSV import** from Mana Flood, ManaBox, Moxfield, Archidekt, etc. — matches by MTGJSON UUID,
  Scryfall id, set+collector, then name; unmatched rows land on a manual-resolution page.
- Per-printing, per-finish quantities with debounced steppers; wishlist; collection value with a
  TCGplayer / Card Kingdom price toggle; browse every set to log what you open.
- A global **card size** control (Small→X-Large) in the header scales every card grid in the app.

### Playtester (`/play`)

- A real-feeling table: free battlefield placement (optional snap-to-grid), all zones, drag
  anywhere, right-click context menus, undo/redo, customizable keybinds.
- **Bot opponents** (up to 3) built from pasted lists or EDHREC average decks, with visible
  reasoning for every play; stacked or side-by-side board layouts.
- Library actions: draw/mill/scry/surveil, search, and **Reveal X** (send each revealed card to
  hand/battlefield/graveyard/exile/top/bottom, shuffle the bottomed ones).
- Deck tokens auto-detected from Scryfall; a counters **Dice Bag** (drag counters onto cards),
  dice & coins, phase stepper, commander tax tracking, mulligans with London bottoming.
- **Notes scratch pad** — jot "underperformed / try X instead" mid-game; it saves onto the deck
  and shows up in the builder's Notes tab.
- Right-click any card → **Card details** for rulings, wishlist, and readable text (secret lair
  art, we love you, but what does the card *do*).
- Save/restore full game snapshots, log finished games (W/L, pod, turns) onto the deck's showcase,
  collapsible hand, optional hover preview, card sizes matching the rest of the app.

### Deck showcase (`/d/[id]`)

Public-facing deck page: decklist, primer sections (strategy, combos, mulligans, matchups, budget),
stats panel, changelog timeline, game log with win rates, collection coverage ("you own 87/99"),
and share/export tools.

## Set up locally

Requirements: **Node 18.18+** (Node 20+ recommended), npm, and a **local Postgres** database. Two
kinds of data live in Postgres: *your* data (collection, decks, wishlist, game logs) and the synced
**MTGJSON card dataset** (cards, sets, identifiers, legalities, rulings) the app reads card info from.

**1. Start Postgres and create a database.** Any local Postgres works.

With Docker:

```bash
docker run -d --name edh-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
docker exec -it edh-postgres createdb -U postgres edh_playtest
```

With a native install (Linux/WSL apt, macOS Homebrew, Windows installer), create the database and make
sure the `postgres` role's password matches your connection string. On a fresh apt/WSL install the role
often has *no* TCP password yet, so set one over the local socket:

```bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE edh_playtest;"
```

(On macOS Homebrew: `brew install postgresql@16 && brew services start postgresql@16 && createdb edh_playtest`.)

**2. Point the app at it.** Create `.env.local` in the project root (adjust user/password/port to your
server):

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/edh_playtest
```

**3. Install, sync the MTGJSON dataset, and run:**

```bash
git clone <this-repo-url>
cd edh-playtest
npm install
npm run sync:mtgjson   # downloads MTGJSON CSVs → Postgres (cards/sets/rulings/…); ~30s, re-run to refresh
npm run dev
```

Then open **<http://localhost:3000>**. Your own tables (decks, collection, …) are created automatically
on first use; `npm run sync:mtgjson` creates and fills the `mtg_*` card tables.

**4. Build the offline search index (in the app).** On **My decks**, click **Sync card database** —
this builds the in-browser search index from your synced `mtg_*` tables (with rarity, sets, and
rulings), so card search and the deck builder work offline. Click **Sync prices** there too to pull
MTGJSON's TCGplayer + Card Kingdom prices (toggle between them on the Collection page).

Card images and the in-browser search/price indexes are cached in your browser; everything in
Postgres (your data **and** the MTGJSON dataset) is a real database you can back up and inspect.

> Upgrading from an older local build? If you have data saved in the browser from before, the
> Collection and My Decks pages show a one-click **"Import your previous data"** banner to move it
> into Postgres.

### First-time tips

- **Refresh the MTGJSON data** any time with `npm run sync:mtgjson` (re-run weekly-ish, or after new
  set releases). It upserts the latest cards, sets, identifiers, legalities, and rulings into Postgres.
- **Sync the card database** (My decks → "Sync card database") after each MTGJSON sync to rebuild the
  in-browser search index, so rarity/keyword/release-date filters and offline search stay current.
- **Import your collection** on the Collection page via "Import CSV". Cards match best by **MTGJSON
  UUID** (resolved locally), then Scryfall ID, set + collector number, or name — so exports from Mana
  Flood, ManaBox, Moxfield, Archidekt, and others work. Unmatched rows go to a **Manual Resolution**
  page where you can find and add them by hand.

### Other commands

```bash
npm run sync:mtgjson  # download MTGJSON CSVs → Postgres mtg_* tables (cards, sets, rulings, …)
npm run build         # production build
npm run start         # run the production build
npm run typecheck     # TypeScript check, no emit
```

## Data & storage

Data lives in a few places, by design:

- **Your data** — decks, primers, changelogs, game logs, collection, and wishlist — is stored in
  your **local Postgres database** (`DATABASE_URL`). It's a real database you can back up, copy, or
  inspect, and it survives clearing your browser. Back it up like any Postgres DB (e.g.
  `pg_dump edh_playtest > backup.sql`).
- **The MTGJSON card dataset** — the `mtg_cards`, `mtg_sets`, `mtg_identifiers`, `mtg_legalities`, and
  `mtg_rulings` tables — also lives in Postgres, populated by `npm run sync:mtgjson`. Re-runnable any
  time; it's reference data, not yours, so it isn't included in your personal backups by default.
- **Disposable caches** — card images (Scryfall CDN), the in-browser card-search index, and the
  TCGplayer/Card Kingdom price index — are cached in your browser (IndexedDB/localStorage). These
  rebuild from your Postgres `mtg_*` tables (or Scryfall, for images) on demand, so losing them costs
  nothing but a re-sync.

### Optional: hosted backend (Supabase)

Prefer a hosted database with cross-device sync and shareable public deck pages? Point the app at a
Supabase project instead of local Postgres:

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor.
2. In `.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   ```

3. Restart `npm run dev`. When these keys are present the app uses Supabase and ignores
   `DATABASE_URL`.

> The shipped row-level-security policies are permissive (anon read/write) so it works without an
> auth flow — fine for a personal instance; tighten them before exposing it publicly.

Note: even with Supabase as your *user-data* backend, the MTGJSON card dataset still lives in a local
Postgres reached via `DATABASE_URL` — set it and run `npm run sync:mtgjson` so card search, rulings,
and prices work.

## Attribution

Card data, prices, rulings, and legalities come from [MTGJSON](https://mtgjson.com). Card images
come from Scryfall's CDN; mana symbol SVGs and the card back are Scryfall assets bundled under
`public/`. Prices are MTGJSON's TCGplayer and Card Kingdom retail data.
