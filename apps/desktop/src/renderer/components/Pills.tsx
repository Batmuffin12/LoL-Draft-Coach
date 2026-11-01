import { tip } from "../format";

export interface PillsProps<T extends string> {
  /** `tour`: its `data-tour` name, for the tour to spotlight. */
  options: { value: T; label: string; title?: string; tour?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Micro text at the right end ("dashed = rank average"). */
  end?: string;
  /** What the pills switch, for screen readers ("Role"). */
  label: string;
  /** Smaller pills, for roles under a sub-tab row. */
  compact?: boolean;
}

/** Sub-tabs and role switches as pills, with an optional micro note on the right. One pill alone still shows (it names the role). */
export function Pills<T extends string>({ options, value, onChange, end, label, compact }: PillsProps<T>) {
  return (
    <div className={compact ? "pills compact" : "pills"} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} data-tour={o.tour} type="button" className={o.value === value ? "pill on" : "pill"} aria-pressed={o.value === value} {...tip(o.title)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
      {end && <span className="micro end">{end}</span>}
    </div>
  );
}
