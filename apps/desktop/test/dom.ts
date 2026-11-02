import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import type { ViewState } from "../src/shared/view";

/**
 * Real clicks on the real screens, for tests with `// @vitest-environment happy-dom` on top. Only
 * dev-only happy-dom and React's own `act`: renderToStaticMarkup covers what a screen draws, this what it does.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** window.coach from the preload script, every call recorded; `push` is the main process sending a state. */
export function fakeCoach() {
  let listener: ((s: ViewState) => void) | null = null;
  const api = {
    onState: vi.fn((cb: (s: ViewState) => void) => {
      listener = cb;
      return () => void (listener = null);
    }),
    setDocked: vi.fn(),
    register: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    deleteData: vi.fn(async () => {}),
    importLoadout: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    exploreList: vi.fn(async (): Promise<unknown> => null),
    exploreChampion: vi.fn(async (): Promise<unknown> => null),
    exploreGames: vi.fn(async (): Promise<unknown> => null),
    minimize: vi.fn(),
    close: vi.fn(),
    restartToUpdate: vi.fn(),
    logError: vi.fn(),
    dismissNotice: vi.fn(),
    tourDone: vi.fn(),
    highlightSeen: vi.fn(),
  };
  (window as unknown as { coach: typeof api }).coach = api;
  return { api, push: (s: ViewState) => act(async () => listener?.(s)) };
}

/** What a browser has and happy-dom hasn't: font loading, and layout (everything measures as a real box). */
export function fakeLayout(): void {
  Object.defineProperty(document, "fonts", { configurable: true, value: { addEventListener: () => {}, removeEventListener: () => {}, ready: Promise.resolve() } });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({ x: 10, y: 10, top: 10, left: 10, right: 110, bottom: 40, width: 100, height: 30, toJSON: () => ({}) }));
}

let root: Root | null = null;
let container: HTMLElement | null = null;

export async function render(el: ReactElement): Promise<HTMLElement> {
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  await act(async () => root!.render(el));
  return container;
}

export async function rerender(el: ReactElement): Promise<void> {
  await act(async () => root!.render(el));
}

export async function cleanup(): Promise<void> {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
}

const textOf = (el: Element) => (el.textContent ?? "").trim();

/** Whether a button with exactly this text is on screen. */
export const hasButton = (text: string) => [...document.querySelectorAll("button")].some((b) => textOf(b) === text);

export function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) => textOf(b) === text);
  if (!found) throw new Error(`No button "${text}" among: ${[...document.querySelectorAll("button")].map(textOf).join(" | ")}`);
  return found;
}

/** A real click, its state updates and whatever promises it started. */
export async function click(target: string | Element): Promise<void> {
  const el = typeof target === "string" ? button(target) : target;
  await act(async () => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
}

export async function key(el: Element, name: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init })));
}

/** Types into an input as a user does, so React's onChange fires. */
export async function type(el: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Lets pending promises and effects finish. */
export const settle = () => act(async () => new Promise<void>((r) => setTimeout(r, 0)));

export const selectedTabs = () => [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map(textOf);

export { createElement };
