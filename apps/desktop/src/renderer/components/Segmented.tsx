export interface SegmentedProps<T extends string> {
  /** `tour`: its `data-tour` name, for the tour to spotlight. */
  options: { value: T; label: string; title?: string; tour?: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Underlined tabs in the band (Runes / Build, Last game / Me / Champions). */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} data-tour={o.tour} role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : undefined} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
