import { draft, type Scenario } from "../src/index";
import { C, world } from "./_world";

export default {
  description: "A whole game: champ select (Ahri mid into Zed), the game, and its end (gameflow EndOfGame).",
  draft: draft({ queueId: 420 })
    .me("middle")
    .hover(C.ahri)
    .ally("top", C.garen)
    .ally("jungle", C.amumu)
    .ally("bottom", C.caitlyn)
    .ally("utility", C.nautilus)
    .enemy(C.darius)
    .enemy(C.zed, "middle")
    .enemy(C.leeSin)
    .enemy(C.jinx)
    .enemy(C.thresh)
    .bans([C.yasuo, C.akali], [C.ezreal, C.lux])
    .owned([C.ahri, C.ekko, C.lux])
    .timers({ planning: 5, ban: 10, pick: 12, finalization: 10 })
    .stopAt("game-end")
    .build(),
  meta: world(),
} satisfies Scenario;
