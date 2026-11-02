import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { roleLabels, uiCopy } from "../src/main/view-copy";
import { RoleChoice, roleTitle } from "../src/renderer/components/ChoiceGroup";
import { setCopy, setRoleLabels } from "../src/renderer/format";

beforeAll(() => {
  const { templates } = loadConfig(findConfigDir(__dirname)).explain;
  setCopy(uiCopy(templates));
  setRoleLabels(roleLabels(templates));
});

const render = (over: Partial<Parameters<typeof RoleChoice>[0]> = {}) => renderToStaticMarkup(createElement(RoleChoice, { roles: ["middle", "utility"], value: "middle", onChange: () => {}, ...over }));

describe("the role filter", () => {
  it("uses the icons of the roles it's given, from the adapter", () => {
    const html = render();
    expect(html).toContain("svg/position-middle.svg");
    expect(html).toContain("svg/position-utility.svg");
    expect(html).not.toContain("position-top");
  });

  it("always has the role's name: beside the chosen one, for screen readers on the others", () => {
    const html = render();
    expect(html).toMatch(/aria-pressed="true".*<span>Mid<\/span>/);
    expect(html).toContain('<span class="sr-only">Support</span>');
  });

  it("has an All choice in words when asked", () => {
    expect(render({ all: true, value: "" })).toMatch(/aria-pressed="true"[^>]*>All</);
    expect(render()).not.toContain(">All<");
  });

  it("says the role's name on hover, then what it's about", () => {
    expect(roleTitle("middle")).toBe("Mid");
    expect(roleTitle("middle", () => "48 games")).toBe("Mid: 48 games");
    expect(render({ about: () => "48 games" })).toContain('title="Support: 48 games"');
  });
});
