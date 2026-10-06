import type { ReactNode } from "react";
import { cx } from "../format";

export interface ButtonProps {
  variant?: "default" | "primary" | "danger" | "ghost";
  wide?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  type?: "button" | "submit";
  children: ReactNode;
}

/** Uppercase like the client, 40px tall. At most one primary per screen. */
export function Button({ variant = "default", wide, disabled, onClick, title, type = "button", children }: ButtonProps) {
  return (
    <button type={type} className={cx("btn", variant !== "default" && variant, wide && "wide")} disabled={disabled} onClick={onClick} title={title}>
      {children}
    </button>
  );
}
