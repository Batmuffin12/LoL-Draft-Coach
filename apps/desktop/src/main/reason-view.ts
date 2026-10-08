import type { Reason } from "@ldc/shared";
import type { ReasonView } from "../shared/view";

/** Explain templates that state a weak point end in .bad, .weak or .risky (e.g. "lane.bad", "meta.weak"). */
const CAVEAT_ID = /\.(bad|weak|risky)$/;

/** "jungle" → "Jungle". */
export const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

export function isCaveat(id: string): boolean {
  return CAVEAT_ID.test(id);
}

/** A rendered reason, marked negative when it is a caveat so the panel can show it in amber. */
export function reasonView(r: Reason, render: (r: Reason) => string): ReasonView {
  return { text: render(r), negative: isCaveat(r.id) };
}
