"use client";

import { useEffect, useState } from "react";
import {
  migrateLegacyData,
  markMigrated,
  pendingLegacyData,
  type MigrationProgress,
  type MigrationStatus,
} from "@/lib/repo/migrate";

/** Offers a one-click import of pre-Postgres browser data into the local DB.
 * Renders nothing unless legacy IndexedDB data is found. */
export function MigrationBanner() {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pendingLegacyData().then(setStatus);
  }, []);

  if (done) {
    return (
      <div className="mb-4 rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-4 py-2 text-xs text-emerald-200">
        ✓ Imported your previous data into the local database.
      </div>
    );
  }
  if (!status) return null;

  const run = async () => {
    setError(null);
    try {
      await migrateLegacyData(setProgress);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Migration failed.");
      setProgress(null);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-amber-800/60 bg-amber-950/20 px-4 py-3">
      <div className="text-sm font-bold text-amber-200">Import your previous data</div>
      <p className="mt-0.5 text-xs text-stone-400">
        We found data saved in this browser from before the local database existed —{" "}
        {status.decks} deck{status.decks === 1 ? "" : "s"}, {status.collection.toLocaleString()}{" "}
        collection stack{status.collection === 1 ? "" : "s"}, {status.wishlist} wishlist card
        {status.wishlist === 1 ? "" : "s"}. Import it into your local Postgres database now.
      </p>
      {progress ? (
        <p className="mt-2 text-xs text-stone-300">
          {progress.phase === "collection"
            ? "Importing collection…"
            : progress.phase === "decks"
              ? `Importing decks… ${progress.done}/${progress.total}`
              : progress.phase === "wishlist"
                ? `Importing wishlist… ${progress.done}/${progress.total}`
                : "Finishing…"}
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => void run()}
            className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
          >
            Import now
          </button>
          <button
            onClick={() => {
              markMigrated();
              setStatus(null);
            }}
            className="text-[11px] text-stone-500 hover:text-stone-300"
          >
            Dismiss
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
