"use client";

import { useUiStore } from "@/lib/game/uiStore";
import { CardImage } from "./CardImage";

/** Large card preview pinned to the top-left while hovering a card. */
export function HoverPreview() {
  const preview = useUiStore((s) => s.preview);
  const dragging = useUiStore((s) => s.dragging);
  if (!preview || dragging) return null;
  return (
    <div className="pointer-events-none fixed top-16 left-4 z-40 hidden w-60 drop-shadow-2xl md:block">
      <CardImage
        card={preview.card}
        tokenSpec={preview.tokenSpec}
        flipped={preview.flipped}
        className="aspect-[5/7] w-full"
      />
    </div>
  );
}
