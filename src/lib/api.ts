export type Cluster = {
  name: string;
  frequency: number;
  severity: 1 | 2 | 3 | 4 | 5;
  implication: string;
};

export type ClustersResult = {
  clusters: Cluster[];
};

export type SprintItem = {
  priority: number;
  feature_name: string;
  why_now: string;
  what_to_build: string[];
  expected_impact: string;
};

export type SprintResult = {
  sprint_focus: SprintItem[];
  defer: string[];
  confidence: "high" | "medium" | "low";
  confidence_note: string;
};

export type AnalysisResult = {
  clusters: Cluster[];
};

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "/api";

type ApiError = {
  error?: string;
  details?: string;
};

async function parseError(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";
  const payload: ApiError | string | null = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");
  if (payload && typeof payload === "object") {
    const error = payload.error ?? "RequestError";
    const details = payload.details ?? `HTTP ${res.status}`;
    return `${error}: ${details}`;
  }
  return typeof payload === "string" && payload.trim()
    ? payload.trim()
    : `Request failed with HTTP ${res.status}`;
}

function normalizeFeedback(feedback: string): string[] {
  return feedback
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => line.slice(0, 300));
}

export async function analyzeFeedback(
  feedback: string,
  source: string
): Promise<ClustersResult> {
  const feedbackItems = normalizeFeedback(feedback);
  const nonce = Date.now().toString();
  const res = await fetch(`${BASE}/analyze?_=${nonce}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, max-age=0",
      Pragma: "no-cache",
    },
    body: JSON.stringify({ feedback: feedbackItems, source }),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}

export async function generateRecommendations(
  clusters: Cluster[],
  source: string
): Promise<SprintResult> {
  const nonce = Date.now().toString();
  const res = await fetch(`${BASE}/recommend?_=${nonce}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, max-age=0",
      Pragma: "no-cache",
    },
    body: JSON.stringify({ clusters, source }),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}
