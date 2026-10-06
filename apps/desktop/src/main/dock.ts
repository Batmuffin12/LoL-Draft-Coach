export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Panel width at the base client height; the whole panel scales with the client like the client scales itself. */
export const PANEL_WIDTH = 440;
export const BASE_CLIENT_HEIGHT = 720;

/** Zoom for a client this tall: client height ÷ 720, never below 1 (text never shrinks). */
export function dockZoom(clientHeight: number): number {
  return Math.max(1, clientHeight / BASE_CLIENT_HEIGHT);
}

/** Docked width at a zoom: 440 at 720p, 550 at 900p, 660 at 1080p. */
export function dockWidth(zoom: number): number {
  return Math.round(PANEL_WIDTH * zoom);
}

/**
 * Where to put the panel next to the League client: to its right if there is room on
 * that display, otherwise to its left, otherwise overlapping its right edge.
 * All values in the same (DIP) coordinate space.
 */
export function computeDockBounds(client: Rect, panelWidth: number, workArea: Rect): Rect {
  const height = Math.min(client.height, workArea.height);
  const y = Math.max(workArea.y, Math.min(client.y, workArea.y + workArea.height - height));
  const rightX = client.x + client.width;
  if (rightX + panelWidth <= workArea.x + workArea.width) return { x: rightX, y, width: panelWidth, height };
  const leftX = client.x - panelWidth;
  if (leftX >= workArea.x) return { x: leftX, y, width: panelWidth, height };
  return { x: workArea.x + workArea.width - panelWidth, y, width: panelWidth, height };
}

export function sameRect(a: Rect | null, b: Rect | null): boolean {
  return !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export interface ClientWindowFinder {
  /** Physical-pixel bounds of the visible League client window, or null if not found / minimised. */
  find(): Rect | null;
}

/**
 * Finds the League client window with user32 (FindWindowW + GetWindowRect).
 * This reads window geometry only — no process or game memory access.
 */
export async function createWin32Finder(): Promise<ClientWindowFinder | null> {
  if (process.platform !== "win32") return null;
  try {
    const koffi = (await import("koffi")).default;
    const user32 = koffi.load("user32.dll");
    const RECT = koffi.struct("LDC_RECT", { left: "long", top: "long", right: "long", bottom: "long" });
    const HWND = koffi.pointer("LDC_HWND", koffi.opaque());
    const FindWindowW = user32.func("__stdcall", "FindWindowW", HWND, ["str16", "str16"]);
    const GetWindowRect = user32.func("__stdcall", "GetWindowRect", "bool", [HWND, koffi.out(koffi.pointer(RECT))]);
    const IsIconic = user32.func("__stdcall", "IsIconic", "bool", [HWND]);
    const IsWindowVisible = user32.func("__stdcall", "IsWindowVisible", "bool", [HWND]);
    return {
      find() {
        // The client UI window's class is "RCLIENT"; fall back to its title.
        const hwnd = FindWindowW("RCLIENT", null) ?? FindWindowW(null, "League of Legends");
        if (!hwnd || IsIconic(hwnd) || !IsWindowVisible(hwnd)) return null;
        const r = { left: 0, top: 0, right: 0, bottom: 0 };
        if (!GetWindowRect(hwnd, r)) return null;
        return { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
      },
    };
  } catch {
    return null;
  }
}
