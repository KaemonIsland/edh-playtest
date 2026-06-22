"use client";

import { LocalRepo } from "./local";
import { ServerRepo } from "./serverRepo";
import { SupabaseRepo } from "./supabase";
import type { Repo } from "./types";

let instance: Repo | null = null;

/**
 * Active repo: Supabase when its env keys exist, otherwise the local Postgres
 * backend (via the /api/db route). The browser IndexedDB repo is no longer the
 * default — it's only used to read legacy data during migration.
 */
export function getRepo(): Repo {
  if (!instance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    instance = url && key ? new SupabaseRepo(url, key) : new ServerRepo();
  }
  return instance;
}

/** The old browser (IndexedDB) repo — used only to migrate pre-Postgres data. */
export function getLegacyLocalRepo(): LocalRepo {
  return new LocalRepo();
}

export * from "./types";
