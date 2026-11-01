import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** The current time, refreshed every `intervalMs` (countdowns, "12 min" ages). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * How many steps a screen must shrink for the panel's scrolling area not to overflow: 0 is the full
 * content, up to `max` the most compact form (secondary lines move to hover). Measured after layout,
 * again when `key` changes or the window resizes, and from the top when the area gets taller (a notice
 * or an import result went) or the fonts arrive, so the screen never needs a scrollbar and never stays compact for nothing.
 */
export function useFitLevel(key: unknown, max: number): number {
  const [level, setLevel] = useState(0);
  const room = useRef(0);
  useLayoutEffect(() => setLevel(0), [key]);
  useEffect(() => {
    const reset = () => setLevel(0);
    document.fonts.addEventListener("loadingdone", reset);
    void document.fonts.ready.then(reset);
    return () => document.fonts.removeEventListener("loadingdone", reset);
  }, []);
  useLayoutEffect(() => {
    const check = () => {
      const s = document.querySelector(".window .scroll");
      if (!s) return;
      const grew = s.clientHeight > room.current;
      room.current = s.clientHeight;
      if (grew && level > 0) setLevel(0);
      else if (s.scrollHeight > s.clientHeight) setLevel((l) => Math.min(max, l + 1));
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  });
  return level;
}

/** False when the full content overflows: the screen then shows its compact form. */
export function useFits(key: unknown): boolean {
  return useFitLevel(key, 1) === 0;
}
