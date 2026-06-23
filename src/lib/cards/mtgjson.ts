import type { ScryImageUris } from "@/types";

/**
 * Shared MTGJSON helpers.
 *
 * The app's card source is MTGJSON, but its *identity* stays the Scryfall
 * printing id (MTGJSON exposes it at `identifiers.scryfallId`). That keeps the
 * collection/decks/wishlist — all keyed by Scryfall id — working untouched, and
 * lets us reconstruct Scryfall image URLs deterministically from the id, since
 * MTGJSON hosts no images.
 */

const SCRY_IMG_BASE = "https://cards.scryfall.io";

/**
 * Reconstruct Scryfall's CDN image URLs from a printing id. Scryfall lays out
 * images at `/{size}/{face}/{id[0]}/{id[1]}/{id}.{ext}` — deterministic, so we
 * don't need the original `image_uris` object MTGJSON lacks.
 */
export function scryfallImageUris(scryfallId: string, face: "front" | "back" = "front"): ScryImageUris {
  const a = scryfallId[0];
  const b = scryfallId[1];
  if (!a || !b) return {};
  const at = (size: string, ext: "jpg" | "png") =>
    `${SCRY_IMG_BASE}/${size}/${face}/${a}/${b}/${scryfallId}.${ext}`;
  return {
    small: at("small", "jpg"),
    normal: at("normal", "jpg"),
    large: at("large", "jpg"),
    png: at("png", "png"),
    art_crop: at("art_crop", "jpg"),
    border_crop: at("border_crop", "jpg"),
  };
}
