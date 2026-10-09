export interface SegmentedProps<T extends string> {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** A small secondary row of tabs under a main tab (a role, This month). */
  sub?: boolean;
}

/** Underlined tabs in the band (Runes & spells / Build, Your style / Your pool); `sub` for the smaller row under one of them. */
export function Segmented<T extends string>({ options, value, onChange, sub }: SegmentedProps<T>) {
  return (
    <div className={sub ? "seg sub" : "seg"} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : undefined} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
