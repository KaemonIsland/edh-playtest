"use client";

import { useMemo, useState } from "react";
import type { Zone } from "@/types";
import { PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { CardImage } from "@/components/cards/CardImage";
import { Modal } from "./Modal";

/**
 * Browse/search any pile (library, graveyard, exile). For the library this is
 * the tutor flow: taking a card to hand shuffles afterwards.
 */
export function LibraryBrowser({
  zone,
  title,
  shuffleAfter,
}: {
  zone: Zone;
  title: string;
  shuffleAfter: boolean;
}) {
  const g = useGameStore();
  const closeModal = useUiStore((s) => s.closeModal);
  const setPreview = useUiStore((s) => s.setPreview);
  const [query, setQuery] = useState("");
  const [tookCard, setTookCard] = useState(false);

  const ids = g.zoneOrder[PLAYER_ID]?.[zone] ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ids;
    return ids.filter((id) => {
      const inst = g.instances[id];
      const card = inst ? g.cards[inst.cardId] : undefined;
      const name = inst?.tokenSpec?.name ?? card?.name ?? "";
      const type = inst?.tokenSpec?.typeLine ?? card?.type_line ?? "";
      const text = card?.oracle_text ?? "";
      return `${name} ${type} ${text}`.toLowerCase().includes(q);
    });
  }, [ids, query, g.instances, g.cards]);

  const done = () => {
    if (shuffleAfter && (tookCard || zone === "library")) g.shuffleLibrary();
    closeModal();
  };

  const act = (id: string, action: "hand" | "battlefield" | "graveyard" | "exile" | "top" | "bottom") => {
    if (action === "top" || action === "bottom") {
      g.moveCard(id, "library", { libraryPlacement: action });
    } else {
      g.moveCard(id, action);
    }
    setTookCard(true);
  };

  return (
    <Modal title={`${title} (${ids.length})`} wide>
      <div className="mb-3 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, type, or text…"
          className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm text-stone-200 placeholder-stone-600 outline-none focus:border-emerald-600"
        />
        {shuffleAfter && (
          <button
            onClick={done}
            className="shrink-0 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
          >
            Done & shuffle
          </button>
        )}
      </div>
      {zone === "library" && (
        <p className="mb-3 text-[11px] text-stone-500">
          Order shown is library order (top first). Taking a card then “Done & shuffle” = tutor.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map((id) => {
          const inst = g.instances[id];
          if (!inst) return null;
          const card = g.cards[inst.cardId];
          return (
            <div
              key={id}
              className="flex flex-col gap-1 rounded-lg border border-stone-800 bg-stone-900/60 p-2"
              style={{ contentVisibility: "auto", containIntrinsicSize: "220px" }}
              onMouseEnter={() => setPreview({ card, tokenSpec: inst.tokenSpec, flipped: inst.flipped })}
              onMouseLeave={() => setPreview(null)}
            >
              <CardImage
                card={card}
                tokenSpec={inst.tokenSpec}
                flipped={inst.flipped}
                className="aspect-[5/7] w-full"
              />
              <div className="grid grid-cols-2 gap-1">
                <ActionBtn onClick={() => act(id, "hand")}>Hand</ActionBtn>
                <ActionBtn onClick={() => act(id, "battlefield")}>Field</ActionBtn>
                {zone !== "graveyard" && <ActionBtn onClick={() => act(id, "graveyard")}>Grave</ActionBtn>}
                {zone !== "exile" && <ActionBtn onClick={() => act(id, "exile")}>Exile</ActionBtn>}
                {zone !== "library" && (
                  <>
                    <ActionBtn onClick={() => act(id, "top")}>Lib top</ActionBtn>
                    <ActionBtn onClick={() => act(id, "bottom")}>Lib btm</ActionBtn>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <div className="py-8 text-center text-sm text-stone-600">No cards match.</div>
      )}
    </Modal>
  );
}

function ActionBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded bg-stone-800 px-1.5 py-1 text-[10px] font-semibold text-stone-300 hover:bg-stone-700"
    >
      {children}
    </button>
  );
}
