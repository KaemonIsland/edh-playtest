import "server-only";
import { Pool } from "pg";

/**
 * Local Postgres connection for the default (local) backend. The whole app's
 * user data — decks, primers, changelog, games, comments, collection,
 * wishlist — lives here in a real database on disk, not in the browser.
 *
 * Configure with DATABASE_URL (see .env.example). The schema is created
 * automatically on first use, so setup is just: have Postgres running.
 */

const DEFAULT_URL = "postgres://postgres:postgres@localhost:5432/edh_playtest";

const SCHEMA_SQL = `
create extension if not exists pgcrypto;

create table if not exists decks (
  id text primary key,
  name text not null,
  format text not null default 'commander',
  commander_names text[] not null default '{}',
  commander_art text,
  color_identity text[] not null default '{}',
  description text,
  deck_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists primers (
  deck_id text primary key references decks(id) on delete cascade,
  strategy text not null default '',
  combos text not null default '',
  mulligans text not null default '',
  matchups text not null default '',
  budget text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists deck_versions (
  id uuid primary key default gen_random_uuid(),
  deck_id text not null references decks(id) on delete cascade,
  date timestamptz not null default now(),
  title text not null,
  adds jsonb not null default '[]',
  cuts jsonb not null default '[]',
  notes text
);
create index if not exists deck_versions_deck_idx on deck_versions(deck_id, date desc);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  deck_id text not null references decks(id) on delete cascade,
  date timestamptz not null default now(),
  pod_size int not null default 4,
  opponents text[] not null default '{}',
  result text not null check (result in ('W','L','D')),
  turns int,
  mulligans int,
  notable_plays text,
  is_playtest boolean not null default false
);
create index if not exists games_deck_idx on games(deck_id, date desc);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  deck_id text not null references decks(id) on delete cascade,
  parent_id uuid references comments(id) on delete cascade,
  author text not null default 'Anonymous',
  body text not null,
  date timestamptz not null default now()
);
create index if not exists comments_deck_idx on comments(deck_id, date);

create table if not exists collection (
  id text primary key,
  printing_id text not null,
  oracle_id text not null,
  name text not null,
  set_code text,
  set_name text,
  collector_number text,
  finish text not null default 'nonfoil',
  quantity int not null default 1,
  card_json jsonb not null,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists collection_oracle_idx on collection(oracle_id);

create table if not exists wishlist (
  oracle_id text primary key,
  name text not null,
  card_json jsonb not null,
  quantity int not null default 1,
  note text,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`;

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL || DEFAULT_URL, max: 5 });
  }
  return pool;
}

/** Create tables on first use (idempotent). */
export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((err) => {
        schemaReady = null; // allow retry on next call
        throw err;
      });
  }
  return schemaReady;
}

/** Run a parameterized query (schema ensured first). */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  const res = await getPool().query(text, params as never[]);
  return res.rows as T[];
}
