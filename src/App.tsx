import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { ClusterCard } from "@/components/ClusterCard";
import { SprintCard } from "@/components/SprintCard";
import {
  analyzeFeedback,
  generateRecommendations,
  type Cluster,
  type SprintResult,
} from "@/lib/api";
import { exportNodeToPdf } from "@/lib/exportPdf";

const SAMPLE = `The video generation takes way too long, sometimes 5-6 minutes for a short clip.
Our learners told us the explainer videos felt slow and the voice was robotic.
The platform UX is confusing — admins can't figure out how to assign content to cohorts.
Pricing tier for L&D teams is unclear, we need a quote to even consider it.
Video quality is great when it works but it crashed twice during a pilot demo.
Students said the videos helped them grasp concepts faster than reading the textbook.
The dashboard for tracking learner progress is missing key metrics like completion rates.
Couldn't find a way to bulk upload course materials, had to do one at a time.
The voiceover sounds unnatural — please add more voice options or a real human option.
Generation failed silently three times today, no error message, just nothing happened.
We need an integration with our LMS (Moodle) — without it we can't roll this out.
Some videos had factual errors in the generated script, learners noticed.
Mobile experience is broken on iOS Safari — video player doesn't load.
Love the product overall, just needs to be 3x faster and more reliable.
Admin onboarding took too long, no clear documentation on getting set up.`;

type SourceType = "Mixed" | "Learner" | "College Admin" | "L&D Team";
type LoadingMode = "analyze" | "recommend" | null;

export default function App() {
  const [feedback, setFeedback] = useState("");
  const [source, setSource] = useState<SourceType>("Mixed");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [sprint, setSprint] = useState<SprintResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loadingMode, setLoadingMode] = useState<LoadingMode>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const reportRef = useRef<HTMLDivElement>(null);
  const analyzeRunRef = useRef(0);
  const recommendRunRef = useRef(0);
  const isLoading = isAnalyzing || isRecommending;

  const responseCount = useMemo(
    () => feedback.split("\n").map((l) => l.trim()).filter(Boolean).length,
    [feedback]
  );

  const sortedClusters = useMemo(() => [...clusters].sort((a, b) => b.severity - a.severity), [clusters]);

  useEffect(() => {
    if (!isLoading) {
      setLoadingStep(0);
      return;
    }
    setLoadingStep(0);
    const interval = setInterval(() => {
      setLoadingStep((step) => Math.min(step + 1, 2));
    }, 2200);
    return () => clearInterval(interval);
  }, [isLoading, loadingMode]);

  async function runAnalyze(nextFeedback: string) {
    const nextCount = nextFeedback.split("\n").map((l) => l.trim()).filter(Boolean).length;
    if (nextCount < 2) {
      toast.error("Paste at least a few feedback responses to analyse.");
      return;
    }
    const runId = ++analyzeRunRef.current;
    recommendRunRef.current += 1;
    setIsAnalyzing(true);
    setLoadingMode("analyze");
    setErrorText(null);
    setSprint(null);
    setClusters([]);

    try {
      const data = await analyzeFeedback(nextFeedback, source);
      if (runId !== analyzeRunRef.current) return;
      setClusters(data.clusters);
      toast.success(`Analyzed ${data.clusters.length} clusters`);
    } catch (e) {
      if (runId !== analyzeRunRef.current) return;
      const message = e instanceof Error ? e.message : "Analysis failed. Please retry.";
      setErrorText(message);
      toast.error(message);
    } finally {
      if (runId !== analyzeRunRef.current) return;
      setIsAnalyzing(false);
      setLoadingMode(null);
    }
  }

  async function handleAnalyze() {
    await runAnalyze(feedback);
  }

  async function handleRecommend() {
    if (clusters.length === 0) return;
    const runId = ++recommendRunRef.current;
    setIsRecommending(true);
    setLoadingMode("recommend");
    setErrorText(null);
    try {
      const data = await generateRecommendations(clusters, source);
      if (runId !== recommendRunRef.current) return;
      setSprint(data);
      toast.success("Recommendations generated");
    } catch (e) {
      if (runId !== recommendRunRef.current) return;
      const message = e instanceof Error ? e.message : "Recommendation generation failed. Please retry.";
      setErrorText(message);
      toast.error(message);
    } finally {
      if (runId !== recommendRunRef.current) return;
      setIsRecommending(false);
      setLoadingMode(null);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split("\n");
    if (lines[0]?.toLowerCase().includes("feedback")) lines.shift(); // strip CSV header
    setFeedback(lines.map((l) => l.replace(/^"|"$/g, "").trim()).filter(Boolean).join("\n"));
    toast.success(`Loaded ${file.name}`);
  }

  async function handleExport() {
    if (!reportRef.current) return;
    toast.info("Generating PDF…");
    try {
      await exportNodeToPdf(reportRef.current, `kplor-insights-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF exported successfully");
    } catch {
      toast.error("PDF export failed. Try again.");
    }
  }

  function reset() {
    analyzeRunRef.current += 1;
    recommendRunRef.current += 1;
    setIsAnalyzing(false);
    setIsRecommending(false);
    setLoadingMode(null);
    setLoadingStep(0);
    setClusters([]);
    setSprint(null);
    setErrorText(null);
    setFeedback("");
    setSource("Mixed");
  }

  function handleUseSample() {
    setFeedback(SAMPLE);
    void runAnalyze(SAMPLE);
  }

  if (isLoading) {
    const steps =
      loadingMode === "recommend"
        ? ["Preparing cluster insights...", "Generating sprint recommendations...", "Finalizing roadmap output..."]
        : ["Reading responses...", "Clustering themes...", "Preparing sprint-ready insights..."];

    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 32 }}>
        <Toaster theme="dark" position="top-right" richColors />
        <div style={{ position: "relative", width: 72, height: 72 }}>
          <div
            className="spin"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "3px solid var(--border)",
              borderTopColor: "var(--teal)",
            }}
          />
          <div style={{ position: "absolute", inset: 10, borderRadius: "50%", background: "var(--teal-glow)" }} />
        </div>

        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((msg, i) => (
            <p
              key={i}
              style={{
                fontSize: 14,
                fontWeight: i === loadingStep ? 700 : 400,
                color: i === loadingStep ? "var(--teal)" : i < loadingStep ? "var(--text-dim)" : "var(--border-hi)",
                textDecoration: i < loadingStep ? "line-through" : "none",
                transition: "all 0.3s",
              }}
            >
              {i < loadingStep ? "✓ " : i === loadingStep ? "● " : "○ "}
              {msg}
            </p>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`pulse-dot${i > 0 ? ` pulse-dot-${i + 1}` : ""}`}
              style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (clusters.length > 0) {
    const topPain = sortedClusters[0]?.name ?? "—";
    return (
      <div style={{ minHeight: "100vh" }}>
        <Toaster theme="dark" position="top-right" richColors />

        {/* Header */}
        <header style={{ borderBottom: "1px solid var(--border)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 10, background: "rgba(13,15,26,0.85)" }}>
          <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Logo />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Kplor Insight Engine</div>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>v1.0 · founder tool</div>
              </div>
            </div>
            <button className="btn-ghost" onClick={reset}>
              ↺ New analysis
            </button>
          </div>
        </header>

        <main className="container" style={{ paddingTop: 32, paddingBottom: 64 }} ref={reportRef}>

          {/* Stats bar */}
          <div className="card card-shadow fade-up" style={{ padding: "18px 24px", marginBottom: 28, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
              <Stat label="Responses" value={responseCount} />
              <Stat label="Clusters" value={clusters.length} />
              <div>
                <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 2 }}>Top Pain</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--teal)" }}>{topPain}</p>
              </div>
              <div>
                <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 2 }}>Source</p>
                <p style={{ fontSize: 14, fontWeight: 700 }}>{source}</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!sprint && (
                <button className="btn-primary" onClick={handleRecommend} disabled={isRecommending}>
                  {isRecommending ? "Generating recommendations..." : "Generate Recommendations"}
                </button>
              )}
              <button className="btn-ghost" onClick={handleExport} disabled={!sprint}>
                ⬇ Export PDF
              </button>
            </div>
          </div>

          {errorText && (
            <div className="card" style={{ padding: "14px 16px", marginBottom: 20, borderColor: "var(--red)" }}>
              <p style={{ color: "var(--red)", fontSize: 13 }}>{errorText}</p>
            </div>
          )}

          {sprint && (
            <div style={{ marginBottom: 32 }}>
              <SprintCard sprint={sprint} />
            </div>
          )}

          {/* Cluster grid */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 16 }}>
              Pain Points · Ranked by Priority Score
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
              {sortedClusters.map((c, i) => (
                <ClusterCard key={`${c.name}-${i}`} c={c} rank={i + 1} />
              ))}
            </div>
          </div>
        </main>

        <footer style={{ textAlign: "center", fontSize: 11, color: "var(--text-dim)", paddingBottom: 24 }}>
          Built for Kplor's founding team · Powered by NVIDIA Llama 3.1 8B
        </footer>
      </div>
    );
  }

  // ── SCREEN: Input ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh" }}>
      <Toaster theme="dark" position="top-right" richColors />

      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="container" style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px" }}>
          <Logo />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Kplor Insight Engine</div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>v1.0 · founder tool</div>
          </div>
        </div>
      </header>

      <main className="container" style={{ paddingTop: 64, paddingBottom: 80 }}>

        {/* Hero */}
        <div className="fade-up" style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,180,216,0.1)", border: "1px solid rgba(0,180,216,0.25)", borderRadius: 99, padding: "5px 14px", fontSize: 12, color: "var(--teal)", fontWeight: 600, marginBottom: 20 }}>
            <span>✦</span> Powered by NVIDIA · meta/llama-3.1-8b-instruct
          </div>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 800, lineHeight: 1.15, marginBottom: 16 }}>
            Paste your feedback.{" "}
            <span style={{ color: "var(--teal)" }}>Get your next sprint.</span>
          </h1>
          <p style={{ fontSize: 17, color: "var(--text-muted)", maxWidth: 540, margin: "0 auto", lineHeight: 1.65 }}>
            Turn unstructured feedback into a prioritised product roadmap — clustered themes, pain point scores, and a "What to Build Next" card in ~30 seconds.
          </p>
        </div>

        {/* Input card */}
        <div className="card card-shadow fade-up fade-up-2" style={{ padding: "28px 28px 24px", maxWidth: 800, margin: "0 auto" }}>

          {/* Controls row */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              Feedback Responses
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as SourceType)}
                id="source-select"
              >
                <option>Mixed</option>
                <option>Learner</option>
                <option>College Admin</option>
                <option>L&D Team</option>
              </select>
              <label
                className="btn-ghost"
                style={{ cursor: "pointer" }}
                htmlFor="csv-upload"
              >
                ↑ CSV
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFile}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>

          {/* Textarea */}
          <textarea
            id="feedback-input"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={13}
            placeholder="Paste feedback here — one response per line, or free-form paragraphs…"
          />

          {/* Footer row */}
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "var(--text-muted)" }}>
              <span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text)", fontSize: 15 }}>
                  {responseCount}
                </span>{" "}
                responses detected
              </span>
              {feedback.length === 0 && (
                <button
                  onClick={handleUseSample}
                  disabled={isLoading}
                  style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", fontSize: 13, fontFamily: "var(--font-sans)", fontWeight: 500, padding: 0, textDecoration: "underline", textUnderlineOffset: 3 }}
                >
                  Try sample data
                </button>
              )}
            </div>
            <button
              id="analyse-btn"
              className="btn-primary"
              onClick={handleAnalyze}
              disabled={responseCount < 2 || isAnalyzing}
            >
              {isAnalyzing ? "Analyzing feedback..." : "✦ Analyse Feedback"}
            </button>
          </div>
          {errorText && <p style={{ marginTop: 12, color: "var(--red)", fontSize: 13 }}>{errorText}</p>}
        </div>

        {/* Feature pills */}
        <div className="fade-up fade-up-3" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 36 }}>
          {["Cluster themes (max 20 inputs)", "Severity scoring 1–5", "Two-step recommendations", "One-click PDF export"].map((f) => (
            <span
              key={f}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 99,
                padding: "5px 14px",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              {f}
            </span>
          ))}
        </div>
      </main>
    </div>
  );
}

function Logo() {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 9,
        background: "linear-gradient(135deg, var(--teal), var(--teal-dark))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 16,
        fontWeight: 800,
        color: "#fff",
        flexShrink: 0,
        boxShadow: "0 0 16px -4px rgba(0,180,216,0.5)",
      }}
    >
      K
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 2 }}>
        {label}
      </p>
      <p style={{ fontSize: 26, fontWeight: 800, fontFamily: "monospace", letterSpacing: "-0.04em" }}>
        {value}
      </p>
    </div>
  );
}
