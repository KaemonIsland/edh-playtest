/**
 * Scryfall oracle-tag ("otag") support. Tags aren't in any bulk data file, but
 * the Scryfall search API honors `otag:` / `function:` — so tag queries route
 * through /api/cards/search (the existing server-side Scryfall proxy).
 *
 * There's no official "list all tags" endpoint, so this is a curated starter
 * list of the tags that matter most for Commander brewing. Slugs follow
 * tagger.scryfall.com; an unknown tag simply returns zero results, so this
 * list is safe to grow by hand.
 */
export const OTAGS: string[] = [
  "ramp",
  "removal",
  "draw",
  "tutor",
  "counterspell",
  "burn",
  "mill",
  "lifegain",
  "discard",
  "reanimation",
  "sacrifice-outlet",
  "blink",
  "clone",
  "copy",
  "extra-turn",
  "extra-combat",
  "land-destruction",
  "graveyard-hate",
  "anthem",
  "evasion",
  "stax",
  "wheel",
  "cost-reduction",
  "untapper",
  "token-generator",
];

/**
 * Skeleton category → the otag that finds candidates for it. Keys are
 * lowercased category names; anything unmapped opens Suggestions untagged.
 */
export const CATEGORY_OTAG: Record<string, string> = {
  ramp: "ramp",
  draw: "draw",
  "card draw": "draw",
  interaction: "removal",
  removal: "removal",
  "board wipes": "board-wipe",
  "board wipe": "board-wipe",
  wipes: "board-wipe",
  protection: "protection",
  tutors: "tutor",
  tutor: "tutor",
  "win cons": "wincon",
  "win con": "wincon",
  wincons: "wincon",
};

/**
 * Does a query use Scryfall search syntax (otag:, o:, t:, id<=ug, cmc>=3…)?
 * Such queries can't run against the local name index and go to the Scryfall
 * proxy instead.
 */
export function isScryfallSyntax(query: string): boolean {
  if (/(^|\s)(otag|function|o|t|id|c|ci|cmc|mv|pow|tou|kw|keyword|is|s|set|r|f|format|a|art):/i.test(query)) {
    return true;
  }
  return /\b(id|c|ci|cmc|mv|pow|tou)\s*(<=|>=|<|>|=)/i.test(query);
}
