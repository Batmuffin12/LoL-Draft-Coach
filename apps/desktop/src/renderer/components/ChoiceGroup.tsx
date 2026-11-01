import { useState } from "react";
import { positionIconUrl } from "@ldc/ddragon/assets";
import { cx, positionLabel, t, tip } from "../format";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** A second line under the label ("62% · 55% WR"). */
  sub?: string;
  title?: string | undefined;
  /** An icon in place of the label; the label shows if it fails to load, and beside it when chosen. */
  icon?: string;
}

/** The icon, or the words when there's no icon or it didn't load. The label is always in the button, for screen readers. */
function Face<T extends string>({ option: o, on }: { option: ChoiceOption<T>; on: boolean }) {
  const [failed, setFailed] = useState(false);
  if (o.icon && !failed) {
    return (
      <>
        <img src={o.icon} alt="" width={20} height={20} onError={() => setFailed(true)} />
        <span className={on ? undefined : "sr-only"}>{o.label}</span>
      </>
    );
  }
  return (
    <>
      {o.label}
      {o.sub && <span className="choice-sub">{o.sub}</span>}
    </>
  );
}

export interface ChoiceGroupProps<T extends string> {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** What it switches, for screen readers ("Role"). */
  label: string;
  /** Micro text at the row's right end. */
  end?: string;
  /** The full width, in equal parts. */
  fill?: boolean;
}

/** An attached row of choices: what's shown, not where you are (tabs are `Segmented`). One alone still shows: it names the role. */
export function ChoiceGroup<T extends string>({ options, value, onChange, label, end, fill }: ChoiceGroupProps<T>) {
  return (
    <div className="choice-row">
      <div className={cx("choices", fill && "fill")} role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" className={o.value === value ? "choice on" : "choice"} aria-pressed={o.value === value} {...tip(o.title ?? (o.icon ? o.label : undefined))} onClick={() => onChange(o.value)}>
            <Face option={o} on={o.value === value} />
          </button>
        ))}
      </div>
      {end && <span className="micro end">{end}</span>}
    </div>
  );
}

export interface RoleChoiceProps {
  roles: string[];
  value: string;
  onChange: (role: string) => void;
  /** Starts with an "All" choice (value ""). */
  all?: boolean;
  /** Hover text for a role, after its name. */
  about?: (role: string) => string;
  end?: string;
}

/** The hover text of a role's button: its name, then what it's about. */
export function roleTitle(role: string, about?: (role: string) => string): string {
  const more = about?.(role);
  return more ? `${positionLabel(role)}: ${more}` : positionLabel(role);
}

/** The role filter: the client's position icons with their names on hover and for the one chosen, words if they don't load. */
export function RoleChoice({ roles, value, onChange, all, about, end }: RoleChoiceProps) {
  const options = roles.map((role): ChoiceOption<string> => ({ value: role, label: positionLabel(role), title: roleTitle(role, about), icon: positionIconUrl(role) }));
  return <ChoiceGroup label={t("label.role")} options={all ? [{ value: "", label: t("explore.all") }, ...options] : options} value={value} onChange={onChange} {...(end ? { end } : {})} />;
}
