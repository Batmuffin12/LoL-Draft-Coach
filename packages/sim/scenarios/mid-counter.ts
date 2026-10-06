import { draft, type Scenario } from "../src/index";
import { C, world } from "./_world";

export default {
  description: "You pick last in mid (red side): their Lee Sin, Garen, Caitlyn, Nautilus and Zed are in.",
  draft: draft({ queueId: 420, side: "red" })
    .order(["top", "jungle", "bottom", "utility", "middle"])
    .me("middle")
    .hover(C.lux)
    .ally("top", C.darius)
    .ally("jungle", C.amumu)
    .ally("bottom", C.jinx)
    .ally("utility", C.thresh)
    .enemy(C.leeSin)
    .enemy(C.garen)
    .enemy(C.caitlyn)
    .enemy(C.nautilus)
    .enemy(C.zed)
    .bans([C.yasuo, C.akali, 0, C.draven, C.malphite], [C.ezreal, C.aatrox, C.morgana, 0, C.jarvan])
    .owned([C.ahri, C.ekko, C.lux])
    .stopAt("my-pick")
    .build(),
  meta: world(),
} satisfies Scenario;
