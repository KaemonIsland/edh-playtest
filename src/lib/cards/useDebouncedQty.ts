"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Quantity stepper state with a debounced commit. Rapid +/- clicks update the
 * displayed value instantly and only write the *net* change to the DB once
 * clicking pauses for `delay` ms — so adding several copies is one write, not
 * one per click. While the write is in flight `busy` is true (show a spinner);
 * a still-pending (uncommitted) change is flagged by `pending`.
 *
 * `committedQty` is the authoritative value from the store; the hook overlays
 * the not-yet-written delta on top of it. Pending writes are flushed on unmount
 * so quick clicks right before navigating away aren't lost.
 */
export function useDebouncedQty(
  committedQty: number,
  onCommit: (netDelta: number) => void | Promise<void>,
  delay = 300,
) {
  const [pendingDelta, setPendingDelta] = useState(0);
  const [busy, setBusy] = useState(false);
  const deltaRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest onCommit so the debounced/unmount flush isn't stale.
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const d = deltaRef.current;
    if (d === 0) return;
    deltaRef.current = 0;
    setPendingDelta(0);
    setBusy(true);
    Promise.resolve(onCommitRef.current(d)).finally(() => setBusy(false));
  };

  const bump = (delta: number) => {
    // Don't let the displayed total go negative.
    if (committedQty + deltaRef.current + delta < 0) return;
    deltaRef.current += delta;
    setPendingDelta(deltaRef.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const d = deltaRef.current;
      if (d !== 0) {
        deltaRef.current = 0;
        void onCommitRef.current(d); // fire-and-forget so the change isn't lost
      }
    };
  }, []);

  return { value: committedQty + pendingDelta, pending: pendingDelta !== 0, busy, bump };
}
