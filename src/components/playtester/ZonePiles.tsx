"use client";

import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { Circle, Dices, X } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import type { ScryCard, Zone } from "@/types";
import { PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useUiStore, type MenuItem } from "@/lib/game/uiStore";
import { resolveDeckTokens, TOKEN_DND_TYPE } from "@/lib/game/tokens";
import {
  COUNTER_DND_TYPE,
  COUNTER_TYPES,
  loadRecentCounters,
  pushRecentCounter,
  type CounterDef,
} from "@/lib/game/counters";
import { CardImage } from "@/components/cards/CardImage";
import { buildCardMenu } from "./cardMenu";

function promptInt(message: string, fallback = 1): number | null {
  const raw = window.prompt(message, String(fallback));
  if (raw === null) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ZonePile({
  zone,
  label,
  topVisible,
}: {
  zone: Zone;
  label: string;
  topVisible: boolean;
}) {
  const g = useGameStore();
  const openMenu = useUiStore((s) => s.openMenu);
  const openModal = useUiStore((s) => s.openModal);
  const setPreview = useUiStore((s) => s.setPreview);
  const { setNodeRef, isOver } = useDroppable({ id: zone });

  const ids = g.zoneOrder[PLAYER_ID]?.[zone] ?? [];
  const topId = zone === "graveyard" || zone === "exile" ? ids[ids.length - 1] : ids[0];
  const topInst = topId ? g.instances[topId] : undefined;
  const topCard = topInst ? g.cards[topInst.cardId] : undefined;

  const zoneMenu = (): MenuItem[] => {
    if (zone === "library") {
      return [
        { label: "Draw 1", onClick: () => g.draw(1) },
        {
          label: "Draw N…",
          onClick: () => {
            const n = promptInt("Draw how many?");
            if (n) g.draw(n);
          },
        },
        {
          label: "Search / browse library",
          onClick: () =>
            openModal({ kind: "browse", zone: "library", title: "Library", shuffleAfter: true, playerId: PLAYER_ID }),
        },
        {
          label: "Scry N…",
          onClick: () => {
            const n = promptInt("Scry how many?");
            if (n) openModal({ kind: "scry", count: n, surveil: false });
          },
        },
        {
          label: "Surveil N…",
          onClick: () => {
            const n = promptInt("Surveil how many?");
            if (n) openModal({ kind: "scry", count: n, surveil: true });
          },
        },
        {
          label: "Mill N…",
          onClick: () => {
            const n = promptInt("Mill how many?");
            if (n) g.mill(n);
          },
        },
        {
          label: "Reveal N…",
          onClick: () => {
            const n = promptInt("Reveal how many?");
            if (n) openModal({ kind: "revealx", count: n });
          },
        },
        {
          label: "Reveal top card",
          onClick: () => {
            g.revealTop();
            const topId = useGameStore.getState().zoneOrder[PLAYER_ID]?.library[0];
            if (topId) useUiStore.getState().setRevealed(topId);
          },
        },
        { label: "Shuffle", onClick: () => g.shuffleLibrary() },
      ];
    }
    return [
      {
        label: `Browse ${label.toLowerCase()}`,
        onClick: () => openModal({ kind: "browse", zone, title: label, shuffleAfter: false, playerId: PLAYER_ID }),
      },
    ];
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors ${
        isOver ? "border-emerald-600/70 bg-emerald-950/30" : "border-stone-800 bg-stone-900/60"
      }`}
    >
      <div className="flex w-full items-center justify-between gap-1">
        <span className="text-[11px] font-semibold tracking-wide text-stone-400">{label}</span>
        <button
          className="rounded px-1 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
          onClick={(e) => openMenu(e.clientX, e.clientY, zoneMenu())}
          title={`${label} actions`}
        >
          ⋮
        </button>
      </div>
      {ids.length === 0 ? (
        <div
          className="relative flex h-[112px] w-[80px] cursor-pointer items-center justify-center rounded-md border border-dashed border-stone-700 text-[10px] text-stone-600"
          onClick={() =>
            openModal({ kind: "browse", zone, title: label, shuffleAfter: zone === "library", playerId: PLAYER_ID })
          }
        >
          empty
        </div>
      ) : (
        <PileTop
          instanceId={topId!}
          zone={zone}
          topVisible={topVisible}
          card={topCard}
          inst={topInst}
          count={ids.length}
          onBrowse={() =>
            openModal({ kind: "browse", zone, title: label, shuffleAfter: zone === "library", playerId: PLAYER_ID })
          }
          onContext={(x, y) =>
            topVisible ? openMenu(x, y, buildCardMenu(topId!)) : openMenu(x, y, zoneMenu())
          }
        />
      )}
    </div>
  );
}

/** Top card of a pile: draggable (library/grave/exile → drag to draw/move). */
function PileTop({
  instanceId,
  zone,
  topVisible,
  card,
  inst,
  count,
  onBrowse,
  onContext,
}: {
  instanceId: string;
  zone: Zone;
  topVisible: boolean;
  card: ReturnType<typeof useGameStore.getState>["cards"][string] | undefined;
  inst: ReturnType<typeof useGameStore.getState>["instances"][string] | undefined;
  count: number;
  onBrowse: () => void;
  onContext: (x: number, y: number) => void;
}) {
  const setPreview = useUiStore((s) => s.setPreview);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: instanceId,
    data: { zone },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="relative cursor-grab touch-none"
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onClick={onBrowse}
      onContextMenu={(e) => {
        e.preventDefault();
        onContext(e.clientX, e.clientY);
      }}
      onMouseEnter={() => {
        if (topVisible && inst)
          setPreview({ card, tokenSpec: inst.tokenSpec, flipped: inst.flipped });
      }}
      onMouseLeave={() => setPreview(null)}
      title={zone === "library" ? "Drag to draw, click to browse" : "Drag to move, click to browse"}
    >
      <CardImage
        card={topVisible ? card : undefined}
        tokenSpec={topVisible ? inst?.tokenSpec : undefined}
        flipped={topVisible ? (inst?.flipped ?? 0) : 0}
        faceDown={!topVisible}
        className="h-[112px] w-[80px]"
      />
      <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-stone-700 px-1.5 py-0.5 text-[10px] font-bold text-stone-100 shadow">
        {count}
      </span>
    </div>
  );
}

function CommandZone() {
  const g = useGameStore();
  const openMenu = useUiStore((s) => s.openMenu);
  const setPreview = useUiStore((s) => s.setPreview);
  const { setNodeRef, isOver } = useDroppable({ id: "command" });
  const ids = g.zoneOrder[PLAYER_ID]?.command ?? [];
  const player = g.players[PLAYER_ID];

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors ${
        isOver ? "border-emerald-600/70 bg-emerald-950/30" : "border-amber-900/40 bg-stone-900/60"
      }`}
    >
      <span className="w-full text-[11px] font-semibold tracking-wide text-amber-500/80">
        Command
      </span>
      {ids.length === 0 && (
        <div className="flex h-[112px] w-[80px] items-center justify-center rounded-md border border-dashed border-stone-700 text-center text-[10px] text-stone-600">
          command zone
        </div>
      )}
      {ids.map((id) => {
        const inst = g.instances[id];
        if (!inst) return null;
        const card = g.cards[inst.cardId];
        const tax = (player?.commanderTax[inst.oracleId] ?? 0) * 2;
        return (
          <CommanderCard
            key={id}
            id={id}
            tax={tax}
            onContext={(x, y) => openMenu(x, y, buildCardMenu(id))}
            onHover={(on) => setPreview(on ? { card, flipped: inst.flipped } : null)}
          >
            <CardImage card={card} flipped={inst.flipped} className="h-[112px] w-[80px]" />
          </CommanderCard>
        );
      })}
    </div>
  );
}

function CommanderCard({
  id,
  tax,
  children,
  onContext,
  onHover,
}: {
  id: string;
  tax: number;
  children: React.ReactNode;
  onContext: (x: number, y: number) => void;
  onHover: (on: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { zone: "command" },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="relative cursor-grab touch-none"
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContext(e.clientX, e.clientY);
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {children}
      {tax > 0 && (
        <span
          title={`Commander tax: +${tax} generic`}
          className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold text-black shadow"
        >
          +{tax}
        </span>
      )}
    </div>
  );
}

/**
 * The deck's possible tokens (from Scryfall all_parts). Shows one selected token
 * you can click to create, or drag straight onto the battlefield; a picker (like
 * the printing chooser) swaps which token is selected. Identical tokens are
 * consolidated upstream in resolveDeckTokens.
 */
function TokensPile() {
  const deck = useGameStore((s) => s.deck);
  const setPreview = useUiStore((s) => s.setPreview);
  const [tokens, setTokens] = useState<ScryCard[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTokens(null);
    setSelectedId(null);
    if (deck) {
      void resolveDeckTokens(deck).then((t) => {
        if (cancelled) return;
        setTokens(t);
        setSelectedId(t[0]?.id ?? null);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [deck]);

  const empty = tokens !== null && tokens.length === 0;
  const selected = tokens?.find((t) => t.id === selectedId) ?? tokens?.[0] ?? null;

  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-sky-900/40 bg-stone-900/60 p-2">
      <span className="w-full text-[11px] font-semibold tracking-wide text-sky-400/80">Tokens</span>

      {selected ? (
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(TOKEN_DND_TYPE, JSON.stringify(selected));
            e.dataTransfer.setData("text/plain", selected.name);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => setPickerOpen(true)}
          onMouseEnter={() => setPreview({ card: selected, flipped: 0 })}
          onMouseLeave={() => setPreview(null)}
          title={`${selected.name} — click to choose a token, drag this one onto the battlefield`}
          className="relative cursor-grab active:cursor-grabbing"
        >
          <CardImage
            card={selected}
            className="h-[112px] w-[80px] ring-1 ring-sky-800/60 transition hover:ring-2 hover:ring-sky-500"
          />
          <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-stone-700 px-1.5 py-0.5 text-[10px] font-bold text-stone-100 shadow">
            {tokens?.length ?? 0}
          </span>
        </div>
      ) : (
        <div
          className={`flex h-[112px] w-[80px] items-center justify-center rounded-md border border-dashed bg-gradient-to-br from-sky-950/40 to-stone-950 text-2xl ${
            empty ? "border-stone-700 opacity-60" : "border-sky-800/60"
          }`}
          title={empty ? "No tokens detected for this deck" : "Finding the deck's tokens…"}
        >
          {tokens === null ? "…" : "∅"}
        </div>
      )}

      {pickerOpen && tokens && (
        <ModalShell
          onClose={() => setPickerOpen(false)}
          size="lg"
          title={
            <>
              Choose a token <span className="font-normal text-stone-500">({tokens.length})</span>
            </>
          }
        >
          <div>
            <p className="mb-3 text-[11px] text-stone-500">
              Pick the token to load — then click it or drag it onto the battlefield. (Detected from
              your cards via Scryfall.)
            </p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {tokens.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedId(t.id);
                    setPickerOpen(false);
                  }}
                  className="group flex flex-col gap-1 text-left"
                  onMouseEnter={() => setPreview({ card: t, flipped: 0 })}
                  onMouseLeave={() => setPreview(null)}
                  title={`Load ${t.name}`}
                >
                  <CardImage
                    card={t}
                    className={`aspect-[5/7] w-full transition group-hover:ring-2 group-hover:ring-sky-500 ${
                      t.id === selected?.id ? "ring-2 ring-sky-400" : ""
                    }`}
                  />
                  <span className="truncate text-[10px] text-stone-400">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

/** A single draggable counter chip (native HTML5 drag onto a battlefield card). */
function CounterChip({
  def,
  onUsed,
}: {
  def: CounterDef;
  onUsed: (name: string) => void;
}) {
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(COUNTER_DND_TYPE, def.name);
        e.dataTransfer.setData("text/plain", def.name);
        e.dataTransfer.effectAllowed = "copy";
        onUsed(def.name);
      }}
      title={`Drag “${def.label}” onto a card`}
      className="flex aspect-square cursor-grab flex-col items-center justify-center gap-0.5 rounded-md border border-stone-700 bg-stone-900 p-1 text-center hover:border-fuchsia-600/60 hover:bg-stone-800 active:cursor-grabbing"
    >
      <def.icon size={16} className="text-stone-300" />
      <span className="w-full truncate text-[8px] leading-tight text-stone-400">{def.label}</span>
    </button>
  );
}

/**
 * Dice Bag: a box that opens a floating tray of counters. Drag a counter onto a
 * battlefield card to add it (handled by BattlefieldCard's native drop). A
 * "recently used" row floats to the top for quick re-use.
 */
function DiceBag() {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (open) setRecent(loadRecentCounters());
  }, [open]);

  const onUsed = (name: string) => setRecent(pushRecentCounter(name));
  const byName = (name: string): CounterDef =>
    COUNTER_TYPES.find((c) => c.name === name) ?? { name, label: name, icon: Circle };

  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-fuchsia-900/40 bg-stone-900/60 p-2">
      <span className="w-full text-[11px] font-semibold tracking-wide text-fuchsia-400/80">
        Dice Bag
      </span>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Open the counter tray"
        className="relative"
      >
        <div
          className={`flex h-[112px] w-[80px] items-center justify-center rounded-md border border-dashed bg-gradient-to-br from-fuchsia-950/40 to-stone-950 text-2xl transition ${
            open ? "border-fuchsia-600/70" : "border-fuchsia-800/60"
          }`}
        >
          <Dices size={26} className="text-fuchsia-300" />
        </div>
      </button>

      {open && (
        <div
          className="fixed right-[136px] bottom-24 z-40 w-60 rounded-xl border border-stone-700 bg-stone-950/95 p-3 shadow-2xl backdrop-blur"
          // Keep clicks inside from bubbling to the board.
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-stone-200">Counters</span>
            <button
              onClick={() => setOpen(false)}
              className="rounded px-1.5 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
            >
              <X size={14} />
            </button>
          </div>

          {recent.length > 0 && (
            <div className="mb-2">
              <div className="mb-1 text-[9px] font-bold tracking-wide text-stone-500 uppercase">
                Recently used
              </div>
              <div className="grid grid-cols-6 gap-1">
                {recent.map((name) => (
                  <CounterChip key={`r-${name}`} def={byName(name)} onUsed={onUsed} />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-1">
            {COUNTER_TYPES.map((def) => (
              <CounterChip key={def.name} def={def} onUsed={onUsed} />
            ))}
          </div>
          <p className="mt-2 text-[9px] leading-snug text-stone-600">
            Drag a counter onto a battlefield card to add one.
          </p>
        </div>
      )}
    </div>
  );
}

/** Right-hand column: Library / Graveyard / Exile piles + command zone + tokens. */
export function ZonePiles() {
  return (
    <div className="flex h-full w-[120px] flex-col justify-start gap-2 overflow-y-auto py-1">
      <ZonePile zone="library" label="Library" topVisible={false} />
      <ZonePile zone="graveyard" label="Graveyard" topVisible={true} />
      <ZonePile zone="exile" label="Exile" topVisible={true} />
      <CommandZone />
      <TokensPile />
      <DiceBag />
    </div>
  );
}
