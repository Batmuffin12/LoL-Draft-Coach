/** Something loading or building up: a micro line, and a thin gold bar when how far along is known. Not a boxed notice. */
export function ProgressRow({ text, done, total }: { text: string; done?: number; total?: number }) {
  const known = done !== undefined && total !== undefined && total > 0;
  const share = known ? Math.max(0, Math.min(1, done / total)) : 0;
  return (
    <div className="progress" role="status">
      <span className="p-text">
        <span>{text}</span>
        {known && <span>{`${Math.round(share * 100)}%`}</span>}
      </span>
      {known && (
        <span className="p-bar" aria-hidden="true">
          <span style={{ width: `${share * 100}%` }} />
        </span>
      )}
    </div>
  );
}
