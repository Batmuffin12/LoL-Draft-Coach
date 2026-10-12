export interface SegmentedProps<T extends string> {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Many tabs (six in the lobby): tighter spacing so they fit 440px. */
  dense?: boolean;
}

/** Underlined tabs in the band (Runes & spells / Build, Your style / Your pool). */
export function Segmented<T extends string>({ options, value, onChange, dense }: SegmentedProps<T>) {
  return (
    <div className={dense ? "seg dense" : "seg"} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : undefined} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
