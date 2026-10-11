import { useEffect, useLayoutEffect, useState } from "react";

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
 * False when the panel's scrolling area overflows with the full content: the screen then shows its
 * compact form (secondary lines move to hover). Measured after layout, again when `key` changes or
 * the window resizes, so the screen never needs a scrollbar.
 */
export function useFits(key: unknown): boolean {
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => setFits(true), [key]);
  useLayoutEffect(() => {
    const check = () => {
      const s = document.querySelector(".window .scroll");
      if (s && s.scrollHeight > s.clientHeight) setFits(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  });
  return fits;
}
