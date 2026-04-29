import type { Cluster } from "@/lib/api";

function SeverityStars({ value }: { value: number }) {
  const color =
    value >= 4 ? "var(--red)" : value >= 2 ? "var(--amber)" : "var(--green)";
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: i < value ? color : "var(--border-hi)",
            transition: "background 0.2s",
          }}
        />
      ))}
      <span
        style={{
          marginLeft: 6,
          fontSize: 11,
          fontWeight: 600,
          color,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {value >= 4 ? "Critical" : value >= 2 ? "Moderate" : "Low"}
      </span>
    </div>
  );
}

export function ClusterCard({ c, rank }: { c: Cluster; rank: number }) {
  const borderColor =
    c.severity >= 4
      ? "var(--red)"
      : c.severity >= 2
        ? "var(--amber)"
        : "var(--green)";

  return (
    <div
      className="card card-shadow fade-up"
      style={{
        padding: "20px",
        borderLeft: `3px solid ${borderColor}`,
        transition: "transform 0.18s, box-shadow 0.18s",
        animationDelay: `${rank * 0.06}s`,
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 12px 40px -8px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: "var(--text-muted)",
              minWidth: 22,
            }}
          >
            #{rank}
          </span>
          <h3 style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{c.name}</h3>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "2px 8px",
              fontSize: 12,
              fontFamily: "monospace",
              fontWeight: 700,
            }}
          >
            {c.frequency}×
          </span>
        </div>
      </div>

      {/* Severity */}
      <SeverityStars value={c.severity} />

      {/* Product implication */}
      <p
        style={{
          marginTop: 12,
          fontSize: 13,
          color: "var(--text)",
          lineHeight: 1.65,
          opacity: 0.9,
        }}
      >
        {c.implication}
      </p>
    </div>
  );
}
