import { draft, type Scenario } from "../src/index";
import { C, world } from "./_world";

export default {
  description: "You pick first (blind) in mid; their team hasn't picked.",
  draft: draft({ queueId: 420 })
    .order(["middle", "top", "jungle", "bottom", "utility"])
    .me("middle")
    .hover(C.ahri)
    .bans([C.zed, C.akali, 0, C.leeSin, C.draven], [C.yasuo, C.jinx, C.thresh, 0, C.darius])
    .owned([C.ahri, C.ekko, C.lux])
    .stopAt("my-pick")
    .build(),
  meta: world(),
} satisfies Scenario;
