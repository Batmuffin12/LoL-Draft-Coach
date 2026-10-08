import { draft, type Scenario } from "../src/index";
import { C, world } from "./_world";

export default {
  description: "Ban phase, your ban in progress: you're mid, hovering Ahri.",
  draft: draft({ queueId: 420 }).me("middle").hover(C.ahri).owned([C.ahri, C.ekko, C.lux, C.yasuo]).stopAt("my-ban").build(),
  meta: world(),
} satisfies Scenario;
