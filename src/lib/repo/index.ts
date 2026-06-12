"use client";

import { LocalRepo } from "./local";
import { SupabaseRepo } from "./supabase";
import type { Repo } from "./types";

let instance: Repo | null = null;

/** Repo singleton: Supabase when env keys exist, IndexedDB otherwise. */
export function getRepo(): Repo {
  if (!instance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    instance = url && key ? new SupabaseRepo(url, key) : new LocalRepo();
  }
  return instance;
}

export * from "./types";
