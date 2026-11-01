import { cx } from "../format";

export interface SegmentedProps<T extends string> {
  options: { value: T; label: string; title?: string; tour?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** A second level, under the main tabs: smaller. */
  sub?: boolean;
  /** Micro text at the row's right end. */
  end?: string | undefined;
  /** Its hover text. */
  endTitle?: string | undefined;
  /** Its `data-tour` name, for the tour to spotlight the row. */
  tour?: string;
}

/** Underlined tabs: where you are (Runes / Build, Last game / Me / Champions). Choices within a screen are `ChoiceGroup`. */
export function Segmented<T extends string>({ options, value, onChange, sub, end, endTitle, tour }: SegmentedProps<T>) {
  return (
    <div className={cx("seg", sub && "sub")} data-tour={tour}>
      <div className="seg-tabs" role="tablist">
        {options.map((o) => (
          <button key={o.value} data-tour={o.tour} role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : undefined} title={o.title} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      {end && (
        <span className="micro seg-end" title={endTitle}>
          {end}
        </span>
      )}
    </div>
  );
}
