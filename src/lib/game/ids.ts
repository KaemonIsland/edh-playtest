let counter = 0;

/** Short unique ids for card instances / log entries. */
export function uid(prefix = "i"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}
