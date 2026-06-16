"use client";

import { memo } from "react";
import type { ScryCard, TokenSpec } from "@/types";
import { activeFace, faceImage } from "@/types";

export const CARD_W = 100;
export const CARD_H = 140;

const COLOR_BG: Record<string, string> = {
  W: "from-amber-100 to-stone-300 text-stone-900",
  U: "from-sky-300 to-blue-500 text-blue-950",
  B: "from-stone-500 to-stone-800 text-stone-100",
  R: "from-orange-300 to-red-500 text-red-950",
  G: "from-lime-300 to-green-600 text-green-950",
};

function tokenBg(colors: string[]): string {
  if (colors.length === 1) return COLOR_BG[colors[0]!] ?? "from-stone-300 to-stone-500 text-stone-900";
  if (colors.length > 1) return "from-yellow-200 to-amber-400 text-amber-950";
  return "from-stone-300 to-stone-500 text-stone-900";
}

interface CardImageProps {
  card?: ScryCard;
  tokenSpec?: TokenSpec;
  flipped?: number;
  faceDown?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** "cover" fills (may crop edges); "contain" shows the whole card. */
  fit?: "cover" | "contain";
}

/** Renders one card visual: Scryfall image, custom-token frame, or card back. */
export const CardImage = memo(function CardImage({
  card,
  tokenSpec,
  flipped = 0,
  faceDown = false,
  className = "",
  fit = "cover",
  style,
}: CardImageProps) {
  if (faceDown) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/card-back.jpg"
        alt="Face-down card"
        draggable={false}
        style={style}
        className={`rounded-[5%] object-cover select-none ${className}`}
      />
    );
  }

  const img = card ? faceImage(card, flipped) : tokenSpec?.imageUri;
  if (img) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={img}
        alt={card ? activeFace(card, flipped).name : (tokenSpec?.name ?? "card")}
        draggable={false}
        loading="lazy"
        style={style}
        className={`rounded-[5%] select-none ${fit === "contain" ? "object-contain" : "object-cover"} ${className}`}
      />
    );
  }

  // Custom token (or missing image): draw a simple frame.
  const name = tokenSpec?.name ?? card?.name ?? "Card";
  const typeLine = tokenSpec?.typeLine ?? card?.type_line ?? "";
  const pt =
    tokenSpec?.power !== undefined && tokenSpec?.toughness !== undefined
      ? `${tokenSpec.power}/${tokenSpec.toughness}`
      : card?.power !== undefined && card?.toughness !== undefined
        ? `${card.power}/${card.toughness}`
        : null;

  return (
    <div
      style={style}
      className={`flex flex-col justify-between rounded-[7%] border border-stone-500 bg-gradient-to-br p-1.5 ${tokenBg(
        tokenSpec?.colors ?? card?.colors ?? [],
      )} ${className}`}
    >
      <div className="text-[9px] leading-tight font-bold break-words">{name}</div>
      <div className="text-[7px] leading-tight opacity-80">{typeLine}</div>
      {pt && <div className="self-end text-[10px] font-bold">{pt}</div>}
    </div>
  );
});
