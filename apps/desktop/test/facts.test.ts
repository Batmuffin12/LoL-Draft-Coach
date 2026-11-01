import { renderReason } from "@ldc/engine";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { filledRow } from "../src/main/pick-card";
import { Facts } from "../src/renderer/components/Facts";

const { templates } = loadConfig(findConfigDir(__dirname)).explain;
const nunu = { id: 20, name: "Nunu & Willump", iconUrl: null };
const html = (props: Parameters<typeof Facts>[0]) => renderToStaticMarkup(createElement(Facts, props));

describe("Facts", () => {
  it("shows a label with its values as separate entries, not a joined sentence", () => {
    const out = html({ rows: [{ label: "Skills", items: [{ text: "Start E, Q, W" }, { text: "Max Q" }] }] });
    expect(out).toContain(">Skills<");
    expect(out.match(/class="fact-item"/g)).toHaveLength(2);
    expect(out).toContain('class="fact-items"');
  });

  it("flows text entries side by side only when asked, champions always", () => {
    expect(html({ rows: [{ label: "x", items: [{ text: "a" }] }], flow: true })).toContain('class="fact-items flow"');
    expect(html({ rows: [{ label: "Tough matchups", items: [{ text: "Nunu & Willump", champion: nunu }] }] })).toContain('class="fact-items flow"');
  });

  it("shows a champion's icon with its name; when short of room the name moves to the icon's hover", () => {
    const rows = [{ label: "Also rusty", items: [{ text: "Nunu & Willump", champion: nunu }] }];
    expect(html({ rows })).toMatch(/class="wrap">Nunu &amp; Willump</);
    const brief = html({ rows, iconOnly: true });
    expect(brief).not.toContain('class="wrap"');
    expect(brief).toContain('title="Nunu &amp; Willump"');
  });
});

describe("the filled note", () => {
  it("is a labelled row with two short entries, with the engine's numbers", () => {
    const say = (r: Parameters<typeof renderReason>[0]) => renderReason(r, templates, String);
    expect(filledRow({ role: "middle", share: 0.12, games: 200 } as never, say)).toEqual({
      label: "You're filled",
      items: [{ text: "Only 12% of your last 200 games are mid" }, { text: "Picks lean on champions you know" }],
    });
  });
});
