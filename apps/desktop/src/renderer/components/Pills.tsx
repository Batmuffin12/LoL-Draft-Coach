export interface PillsProps<T extends string> {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Micro text at the right end ("dashed = rank average"). */
  end?: string;
  /** What the pills switch, for screen readers ("Role"). */
  label: string;
}

/** Role switches as pills, with an optional micro note on the right. One pill alone still shows (it names the role). */
export function Pills<T extends string>({ options, value, onChange, end, label }: PillsProps<T>) {
  return (
    <div className="pills" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? "pill on" : "pill"} aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
      {end && <span className="micro end">{end}</span>}
    </div>
  );
}
