-- EDH Playtest — showcase backend schema (Supabase / Postgres).
-- Apply in the Supabase SQL editor, then set in .env.local:
--   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
--   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
--
-- RLS note: policies below are permissive (anon read/write) so the app works
-- without an auth flow — suitable for a personal instance. The owner_id
-- columns are in place for tightening once Supabase Auth is wired up:
-- replace the anon policies with `auth.uid() = owner_id` checks.

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists decks (
  id text primary key,
  owner_id uuid references profiles(id),
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
  adds jsonb not null default '[]',   -- [{ "name": "...", "reason": "..." }]
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
  id text primary key,              -- `${printing_id}:${finish}`
  owner_id uuid references profiles(id),
  printing_id text not null,        -- scryfall card id of the printing
  oracle_id text not null,
  name text not null,
  set_code text,
  set_name text,
  collector_number text,
  finish text not null default 'nonfoil' check (finish in ('nonfoil','foil','etched')),
  quantity int not null default 1,
  card_json jsonb not null,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists collection_oracle_idx on collection(oracle_id);

create table if not exists wishlist (
  oracle_id text primary key,
  owner_id uuid references profiles(id),
  name text not null,
  card_json jsonb not null,
  quantity int not null default 1,
  note text,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row-Level Security (permissive anon policies; see note at top).
alter table profiles enable row level security;
alter table decks enable row level security;
alter table primers enable row level security;
alter table deck_versions enable row level security;
alter table games enable row level security;
alter table comments enable row level security;
alter table collection enable row level security;
alter table wishlist enable row level security;

create policy "anon read decks" on decks for select using (true);
create policy "anon write decks" on decks for insert with check (true);
create policy "anon update decks" on decks for update using (true);
create policy "anon delete decks" on decks for delete using (true);

create policy "anon read primers" on primers for select using (true);
create policy "anon write primers" on primers for insert with check (true);
create policy "anon update primers" on primers for update using (true);

create policy "anon read versions" on deck_versions for select using (true);
create policy "anon write versions" on deck_versions for insert with check (true);
create policy "anon delete versions" on deck_versions for delete using (true);

create policy "anon read games" on games for select using (true);
create policy "anon write games" on games for insert with check (true);
create policy "anon delete games" on games for delete using (true);

create policy "anon read comments" on comments for select using (true);
create policy "anon write comments" on comments for insert with check (true);
create policy "anon delete comments" on comments for delete using (true);

create policy "anon read collection" on collection for select using (true);
create policy "anon write collection" on collection for insert with check (true);
create policy "anon update collection" on collection for update using (true);
create policy "anon delete collection" on collection for delete using (true);

create policy "anon read wishlist" on wishlist for select using (true);
create policy "anon write wishlist" on wishlist for insert with check (true);
create policy "anon update wishlist" on wishlist for update using (true);
create policy "anon delete wishlist" on wishlist for delete using (true);
