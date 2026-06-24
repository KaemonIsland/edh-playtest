"use client";

import { useEffect, useState } from "react";
import { getRepo, type CollectionCard } from "@/lib/repo";
import {
  getCardDbStatus,
  syncCardDatabase,
  type CardDbStatus,
  type SyncProgress,
} from "@/lib/cards/carddb";
import {
  getPriceSyncStatus,
  syncPrices,
  usePriceStore,
  PRICE_SOURCE_LABEL,
  type PriceSyncStatus,
  type PriceSource,
} from "@/lib/cards/pricing";
import { collectionCsvWithUuids } from "@/lib/cards/collectionCsv";
import { downloadTextFile } from "@/lib/download";
import { ImportCsvModal } from "@/components/collection/ImportCsvModal";

export default function SettingsPage() {
  const [dbStatus, setDbStatus] = useState<CardDbStatus>({ syncedAt: null, count: 0 });
  const [syncing, setSyncing] = useState<SyncProgress | null>(null);
  const [priceStatus, setPriceStatus] = useState<PriceSyncStatus>({ syncedAt: null, count: 0 });
  const [pricesSyncing, setPricesSyncing] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [collectionCount, setCollectionCount] = useState<number | null>(null);

  const priceSource = usePriceStore((s) => s.source);
  const setPriceSource = usePriceStore((s) => s.setSource);

  const refreshCount = () =>
    void getRepo().listCollection().then((c: CollectionCard[]) =>
      setCollectionCount(c.filter((x) => x.quantity > 0).length),
    );

  useEffect(() => {
    setDbStatus(getCardDbStatus());
    setPriceStatus(getPriceSyncStatus());
    refreshCount();
  }, []);

  const runSync = async () => {
    try {
      setDbStatus(await syncCardDatabase(setSyncing));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Card database sync failed.");
    } finally {
      setSyncing(null);
    }
  };

  const runPriceSync = async () => {
    setPricesSyncing(true);
    try {
      await syncPrices();
      setPriceStatus(getPriceSyncStatus());
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Price sync failed.");
    } finally {
      setPricesSyncing(false);
    }
  };

  const exportCollection = async () => {
    const owned = (await getRepo().listCollection()).filter((c) => c.quantity > 0);
    if (owned.length === 0) {
      window.alert("Your collection is empty.");
      return;
    }
    downloadTextFile(
      `collection-${new Date().toISOString().slice(0, 10)}.csv`,
      await collectionCsvWithUuids(owned),
      "text/csv",
    );
  };

  return (
    <div className="min-h-dvh bg-[#08080a] text-stone-200">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          Data syncing, collection import/export, and display preferences.
        </p>

        {/* Local data */}
        <h2 className="mt-8 mb-2 text-xs font-bold tracking-wide text-stone-400 uppercase">Local data</h2>
        <div className="space-y-3">
          <Row
            title="Local card database"
            desc={
              dbStatus.syncedAt
                ? `${dbStatus.count.toLocaleString()} cards · synced ${new Date(dbStatus.syncedAt).toLocaleDateString()} — offline search with rarity, sets, and rulings.`
                : "Not synced — card search falls back to the Scryfall API. Builds from your local MTGJSON tables for offline search with printing rarity, sets, and rulings."
            }
            action={
              <button
                onClick={() => void runSync()}
                disabled={!!syncing}
                className="rounded-md bg-sky-700 px-4 py-2 text-xs font-bold text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {syncing
                  ? syncing.phase === "store"
                    ? `Storing ${syncing.stored.toLocaleString()}/${syncing.total.toLocaleString()}…`
                    : syncing.phase === "download"
                      ? "Downloading…"
                      : "Preparing…"
                  : dbStatus.syncedAt
                    ? "Re-sync"
                    : "Sync card database"}
              </button>
            }
          />
          <Row
            title="Card prices (MTGJSON)"
            desc={
              priceStatus.syncedAt
                ? `${priceStatus.count.toLocaleString()} priced printings · synced ${new Date(priceStatus.syncedAt).toLocaleDateString()}.`
                : "Not synced — values fall back to Scryfall's TCGplayer prices. Sync once (~37MB from MTGJSON) for TCGplayer + Card Kingdom prices."
            }
            action={
              <button
                onClick={() => void runPriceSync()}
                disabled={pricesSyncing}
                className="rounded-md bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {pricesSyncing ? "Syncing prices…" : priceStatus.syncedAt ? "Re-sync prices" : "Sync prices"}
              </button>
            }
          />
        </div>

        {/* Collection */}
        <h2 className="mt-8 mb-2 text-xs font-bold tracking-wide text-stone-400 uppercase">Collection</h2>
        <Row
          title="Import / export collection"
          desc={
            collectionCount === null
              ? "Import a CSV (Mana Flood / Archidekt / Moxfield / ManaBox), or export yours as CSV."
              : `${collectionCount.toLocaleString()} owned cards. Import a CSV, or export yours as a backup.`
          }
          action={
            <div className="flex gap-2">
              <button
                onClick={() => setImportOpen(true)}
                className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600"
              >
                📥 Import CSV
              </button>
              <button
                onClick={() => void exportCollection()}
                className="rounded-md border border-stone-700 bg-stone-900 px-4 py-2 text-xs font-semibold text-stone-300 hover:bg-stone-800"
              >
                📤 Export CSV
              </button>
            </div>
          }
        />

        {/* Preferences */}
        <h2 className="mt-8 mb-2 text-xs font-bold tracking-wide text-stone-400 uppercase">Preferences</h2>
        <Row
          title="Price source"
          desc="Which retailer's prices to show across your collection and decks."
          action={
            <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-stone-900 p-0.5">
              {(["tcgplayer", "cardkingdom"] as PriceSource[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setPriceSource(s)}
                  className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                    priceSource === s ? "bg-stone-700 text-white" : "text-stone-400 hover:text-stone-200"
                  }`}
                >
                  {PRICE_SOURCE_LABEL[s]}
                </button>
              ))}
            </div>
          }
        />

        <p className="mt-8 text-center text-[10px] text-stone-600">
          {getRepo().mode === "supabase"
            ? "Stored in Supabase."
            : "Stored in your local Postgres database. Add Supabase keys for a hosted/shared backend."}{" "}
          Card data and images provided by Scryfall.
        </p>
      </div>

      {importOpen && (
        <ImportCsvModal
          onClose={() => setImportOpen(false)}
          onImported={() => refreshCount()}
        />
      )}
    </div>
  );
}

function Row({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-800 bg-stone-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-stone-200">{title}</h3>
          <p className="mt-0.5 text-xs text-stone-500">{desc}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    </div>
  );
}
