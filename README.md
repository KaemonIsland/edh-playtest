# Glitched Goblet Playtester

A local-first Magic: The Gathering / Commander (EDH) workshop: track your **collection**, build and
showcase **decks** (primers, stats, changelogs, game logs), **playtest** solo or against rules-based
bot opponents, and browse **all cards** by set to log what you open.

Card data and images are provided by [Scryfall](https://scryfall.com). Not affiliated with Wizards
of the Coast. Unofficial Fan Content permitted under the WotC Fan Content Policy.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Zustand · dnd-kit · Framer Motion · Dexie
(IndexedDB).

## Set up locally

Requirements: **Node 18.18+** (Node 20+ recommended), npm, and a **local Postgres** database
(your collection, decks, wishlist, and game logs live there — a real database file, not browser
storage that a "clear site data" could wipe).

**1. Start Postgres and create a database.** Any local Postgres works. For example with Docker:

```bash
docker run -d --name edh-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
docker exec -it edh-postgres createdb -U postgres edh_playtest
```

Or with a native install (Homebrew): `brew install postgresql@16 && brew services start postgresql@16
&& createdb edh_playtest`.

**2. Point the app at it.** Copy the example env and adjust if your connection differs:

```bash
cp .env.example .env.local   # defaults to postgres://postgres:postgres@localhost:5432/edh_playtest
```

**3. Run it:**

```bash
git clone <this-repo-url>
cd edh-playtest
npm install
npm run dev
```

Then open **<http://localhost:3000>**. The database tables are created automatically on first use —
no manual SQL needed.

Card images and the (optional) bulk card-search database are cached in your browser; everything
that's *yours* lives in Postgres.

> Upgrading from an older local build? If you have data saved in the browser from before, the
> Collection and My Decks pages show a one-click **"Import your previous data"** banner to move it
> into Postgres.

### First-time tips

- **Sync the card database** (My decks → "Sync card database") for instant, offline card search
  and to populate rarity/keyword/release-date filters. It's a one-time ~35 MB download from
  Scryfall's bulk data, cached locally.
- **Import your collection** on the Collection page via "Import CSV" (works with Mana Flood,
  Archidekt, and Moxfield exports that include a Scryfall ID column).

### Other commands

```bash
npm run build      # production build
npm run start      # run the production build
npm run typecheck  # TypeScript check, no emit
```

## Data & storage

Your data lives in **two places**, by design:

- **Your data** — decks, primers, changelogs, game logs, collection, and wishlist — is stored in
  your **local Postgres database** (`DATABASE_URL`). It's a real database you can back up, copy, or
  inspect, and it survives clearing your browser. Back it up like any Postgres DB (e.g.
  `pg_dump edh_playtest > backup.sql`).
- **Disposable caches** — card images, the synced bulk card-search database, resolved-card lookups,
  and the set list — are cached in your browser (IndexedDB/localStorage). These rebuild from
  Scryfall on demand, so losing them costs nothing but a re-sync.

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

## Attribution

Card data, images, prices, and set symbols come from Scryfall. Mana symbol SVGs and the card back
are Scryfall assets bundled under `public/`.
