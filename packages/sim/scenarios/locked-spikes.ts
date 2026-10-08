import { locked } from "./_locked";
import { C } from "./_world";

/** Locked in Ahri mid against Zed, with measured power spikes that passed their split-half check (M8). */
const base = locked(600, "solid");
const stat = (kind: "item" | "level", at: number, minute: number, gold: number, goldZ: number) => ({ kind, at, n: 450, minute, gold, goldZ });

export default {
  ...base,
  description: `${base.description} Ahri spikes at her first item, Zed at level 6.`,
  meta: {
    ...base.meta!,
    spikes: [
      { championId: C.ahri, role: "middle", spikes: [stat("item", 1, 11.4, 140, 3.4), stat("item", 2, 16.2, 40, 1.1), stat("level", 6, 8.1, 60, 1.6)] },
      { championId: C.zed, role: "middle", spikes: [stat("item", 1, 10.6, 70, 1.8), stat("level", 6, 7.9, 160, 4.1)] },
    ],
    spikeCheck: { pairs: 320, goldCorrelation: 0.68, signAgreement: 0.91, strongPairs: 74 },
  },
};
