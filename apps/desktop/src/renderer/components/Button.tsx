import type { ReactNode } from "react";
import { cx } from "../format";

export interface ButtonProps {
  variant?: "default" | "primary" | "danger" | "ghost";
  wide?: boolean;
  /** On a section rule: shorter. */
  small?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  type?: "button" | "submit";
  children: ReactNode;
}

/** Uppercase like the client, 40px tall. At most one primary per screen. */
export function Button({ variant = "default", wide, small, disabled, onClick, title, type = "button", children }: ButtonProps) {
  return (
    <button type={type} className={cx("btn", variant !== "default" && variant, wide && "wide", small && "small")} disabled={disabled} onClick={onClick} title={title}>
      {children}
    </button>
  );
}
