import { draft, type Scenario } from "../src/index";
import { C, world } from "./_world";

/** Locked in Ahri mid against Zed, champ select finishing; Ahri's build has `games` games in the band. */
export function locked(games: number, label: string): Scenario {
  return {
    description: `Locked in Ahri mid against Zed; Ahri's build has ${games} games in the band (${label} data).`,
    draft: draft({ queueId: 420, side: "red" })
      .order(["top", "jungle", "bottom", "utility", "middle"])
      .me("middle")
      .ally("top", C.darius)
      .ally("jungle", C.amumu)
      .ally("bottom", C.jinx)
      .ally("utility", C.thresh)
      .enemy(C.leeSin)
      .enemy(C.garen)
      .enemy(C.caitlyn)
      .enemy(C.nautilus)
      .enemy(C.zed)
      .pick(C.ahri)
      .owned([C.ahri, C.ekko, C.lux])
      .stopAt("finalization")
      .build(),
    meta: world(games),
  };
}
