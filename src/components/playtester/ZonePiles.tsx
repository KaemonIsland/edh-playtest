"use client";

import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import type { Zone } from "@/types";
import { PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useUiStore, type MenuItem } from "@/lib/game/uiStore";
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
            openModal({ kind: "browse", zone: "library", title: "Library", shuffleAfter: true }),
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
        { label: "Reveal top card", onClick: () => g.revealTop() },
        { label: "Shuffle", onClick: () => g.shuffleLibrary() },
      ];
    }
    return [
      {
        label: `Browse ${label.toLowerCase()}`,
        onClick: () => openModal({ kind: "browse", zone, title: label, shuffleAfter: false }),
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
      <button
        className="relative"
        onClick={() =>
          openModal({
            kind: "browse",
            zone,
            title: label,
            shuffleAfter: zone === "library",
          })
        }
        onContextMenu={(e) => {
          e.preventDefault();
          if (topVisible && topId) openMenu(e.clientX, e.clientY, buildCardMenu(topId));
          else openMenu(e.clientX, e.clientY, zoneMenu());
        }}
        onMouseEnter={() => {
          if (topVisible && topInst)
            setPreview({ card: topCard, tokenSpec: topInst.tokenSpec, flipped: topInst.flipped });
        }}
        onMouseLeave={() => setPreview(null)}
        title={`Browse ${label.toLowerCase()}`}
      >
        {ids.length === 0 ? (
          <div className="flex h-[112px] w-[80px] items-center justify-center rounded-md border border-dashed border-stone-700 text-[10px] text-stone-600">
            empty
          </div>
        ) : (
          <CardImage
            card={topVisible ? topCard : undefined}
            tokenSpec={topVisible ? topInst?.tokenSpec : undefined}
            flipped={topVisible ? (topInst?.flipped ?? 0) : 0}
            faceDown={!topVisible}
            className="h-[112px] w-[80px]"
          />
        )}
        <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-stone-700 px-1.5 py-0.5 text-[10px] font-bold text-stone-100 shadow">
          {ids.length}
        </span>
      </button>
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

/** Right-hand column: Library / Graveyard / Exile piles + command zone. */
export function ZonePiles() {
  return (
    <div className="flex h-full w-[120px] flex-col justify-start gap-2 overflow-y-auto py-1">
      <ZonePile zone="library" label="Library" topVisible={false} />
      <ZonePile zone="graveyard" label="Graveyard" topVisible={true} />
      <ZonePile zone="exile" label="Exile" topVisible={true} />
      <CommandZone />
    </div>
  );
}
