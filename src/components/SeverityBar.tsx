export function SeverityBar({ value }: { value: number }) {
  const v = Math.max(1, Math.min(5, value));
  const color =
    v >= 4 ? "var(--color-severity-high)" : v >= 2 ? "var(--color-severity-mid)" : "var(--color-severity-low)";
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="h-1.5 w-5 rounded-full transition-all"
          style={{ background: i <= v ? color : "var(--color-muted)" }}
        />
      ))}
      <span className="ml-1 text-xs font-medium text-muted-foreground tabular-nums">{v}/5</span>
    </div>
  );
}
