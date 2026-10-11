import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

/** Characters per box and boxes: the server's codes are 12 characters in groups of four. */
const PART = 4;
const PARTS = 3;

/** Only letters and digits, upper case: what the server compares (it ignores dashes and spaces). */
const clean = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Splits a code into the boxes: "abcd-efgh ijkl" → ["ABCD", "EFGH", "IJKL"]. */
export function splitCode(code: string): string[] {
  const c = clean(code).slice(0, PART * PARTS);
  return Array.from({ length: PARTS }, (_, i) => c.slice(i * PART, (i + 1) * PART));
}

/** The boxes as one value: "ABCD-EFGH-IJKL" (a short box keeps its place, so typing in box 2 first works). */
export function joinCode(parts: string[]): string {
  return parts.join("-").replace(/-+$/, "");
}

/** Characters in a code, without the dashes. */
export function codeLength(code: string): number {
  return clean(code).length;
}

/**
 * The invite code as three boxes of four. Pasting a whole code into any box fills all three;
 * typing past four moves on; Backspace in an empty box goes back. The value is the joined code.
 */
export function InviteCodeInput({ value, onChange, label, id }: { value: string; onChange: (code: string) => void; label: (part: number, of: number) => string; id?: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const parts = value.split("-").concat(["", "", ""]).slice(0, PARTS);
  const focus = (i: number) => refs.current[Math.max(0, Math.min(PARTS - 1, i))]?.focus();

  const type = (i: number, raw: string) => {
    const c = clean(raw);
    if (c.length <= PART) {
      const next = [...parts];
      next[i] = c;
      onChange(joinCode(next));
      if (c.length === PART && i < PARTS - 1) focus(i + 1);
      return;
    }
    // More than fits: the rest flows into the next boxes.
    const before = parts.slice(0, i).join("");
    onChange(joinCode(splitCode(before + c)));
    focus(Math.floor((before + c).length / PART));
  };
  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const c = clean(e.clipboardData.getData("text"));
    if (c.length <= PART) return;
    e.preventDefault();
    onChange(joinCode(splitCode(c)));
    focus(Math.floor(c.length / PART));
  };
  const key = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !parts[i] && i > 0) {
      e.preventDefault();
      focus(i - 1);
    }
  };
  return (
    <div className="code">
      {parts.map((p, i) => (
        <span key={i} className="code-part">
          {i > 0 && (
            <span className="t-heading muted" aria-hidden="true">
              –
            </span>
          )}
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={i === 0 ? id : undefined}
            className="box"
            value={p}
            onChange={(e) => type(i, e.target.value)}
            onPaste={paste}
            onKeyDown={(e) => key(i, e)}
            aria-label={label(i + 1, PARTS)}
            placeholder="····"
            autoComplete="off"
            spellCheck={false}
          />
        </span>
      ))}
    </div>
  );
}
