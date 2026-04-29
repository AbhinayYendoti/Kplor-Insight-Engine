import type { SprintResult } from "@/lib/api";

const CONFIDENCE_COLOR = {
  high: "var(--green)",
  medium: "var(--amber)",
  low: "var(--red)",
};

export function SprintCard({ sprint }: { sprint: SprintResult }) {
  return (
    <div
      className="card glow fade-up"
      style={{
        padding: "28px 32px",
        border: "1.5px solid rgba(0,180,216,0.35)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow blob */}
      <div
        style={{
          position: "absolute",
          top: -60,
          right: -60,
          width: 220,
          height: 220,
          background: "radial-gradient(circle, rgba(0,180,216,0.10) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, position: "relative" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, var(--teal), var(--teal-dark))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          ✦
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--teal)", marginBottom: 2 }}>
            Recommended
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Next Sprint Focus</h2>
        </div>
        <div
          style={{
            marginLeft: "auto",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 99,
            padding: "4px 14px",
            fontSize: 12,
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          confidence:{" "}
          <span style={{ fontWeight: 700, color: CONFIDENCE_COLOR[sprint.confidence] }}>
            {sprint.confidence}
          </span>
        </div>
      </div>

      {/* Sprint items */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          position: "relative",
        }}
      >
        {sprint.sprint_focus.map((s, idx) => (
          <div
            key={s.priority}
            className="fade-up"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "18px 18px 16px",
              animationDelay: `${0.1 + idx * 0.08}s`,
            }}
          >
            {/* Priority badge + name */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: "linear-gradient(135deg, var(--teal), var(--teal-dark))",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {s.priority}
              </span>
              <h3 style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{s.feature_name}</h3>
            </div>

            {/* Why now */}
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 12, lineHeight: 1.55 }}>
              {s.why_now}
            </p>

            {/* What to build */}
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {s.what_to_build.map((b, i) => (
                <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, lineHeight: 1.5 }}>
                  <span style={{ color: "var(--teal)", marginTop: 2, flexShrink: 0 }}>→</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            {/* Expected impact */}
            <div
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: 12,
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>Impact: </span>
              <span style={{ color: "var(--text)", opacity: 0.9 }}>{s.expected_impact}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Defer list */}
      {sprint.defer.length > 0 && (
        <div
          style={{
            marginTop: 20,
            padding: "12px 16px",
            border: "1px dashed var(--border-hi)",
            borderRadius: 10,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            position: "relative",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
            🕐 Defer:
          </span>
          {sprint.defer.map((d, i) => (
            <span
              key={i}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "2px 10px",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              {d}
            </span>
          ))}
        </div>
      )}

      {/* Confidence note */}
      <p style={{ marginTop: 14, fontSize: 12, color: "var(--text-dim)", fontStyle: "italic", position: "relative" }}>
        {sprint.confidence_note}
      </p>
    </div>
  );
}
