import json
import logging
import time
from typing import List

from fastapi import APIRouter, HTTPException

from app.models.schema import AnalyzeRequest, AnalyzeResponse, RecommendRequest, RecommendResponse
from app.services.llm import call_llm_json

logger = logging.getLogger("kplor-api")
router = APIRouter(prefix="/api", tags=["analysis"])

CLUSTER_PROMPT = (
    "You are analyzing startup user feedback. Cluster into 5 themes. "
    "Return ONLY valid JSON with this exact shape: "
    "{\"clusters\":[{\"name\":\"string\",\"frequency\":1,\"severity\":1,\"implication\":\"string\"}]}. "
    "No markdown, no commentary."
)

RECOMMEND_PROMPT = (
    "You are a product engineer. Given these feedback clusters, return valid JSON with: "
    "{sprint_focus:[{priority, feature_name, why_now, what_to_build, expected_impact}], "
    "defer:[string], confidence, confidence_note}. "
    "Return ONLY JSON."
)


def _normalize_feedback(raw_feedback: List[str]) -> List[str]:
    cleaned = [item.strip()[:300] for item in raw_feedback if item and item.strip()]
    return cleaned[:20]


def _coerce_clusters(result: dict, feedback_items: List[str]) -> List[dict]:
    candidates = result.get("clusters")
    if not isinstance(candidates, list):
        for alt_key in ("themes", "items", "data"):
            alt = result.get(alt_key)
            if isinstance(alt, list):
                candidates = alt
                break
    if isinstance(candidates, dict):
        for nested_key in ("clusters", "items", "themes"):
            nested = candidates.get(nested_key)
            if isinstance(nested, list):
                candidates = nested
                break

    normalized: List[dict] = []
    if isinstance(candidates, list):
        for idx, item in enumerate(candidates[:5], start=1):
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("theme") or f"Theme {idx}").strip()
            frequency_raw = item.get("frequency", 1)
            severity_raw = item.get("severity", 3)
            try:
                frequency = max(1, int(frequency_raw))
            except Exception:
                frequency = 1
            try:
                severity = max(1, min(5, int(severity_raw)))
            except Exception:
                severity = 3
            implication = str(
                item.get("implication")
                or item.get("product_implication")
                or item.get("why")
                or "This theme impacts user experience and should be addressed."
            ).strip()
            normalized.append(
                {
                    "name": name,
                    "frequency": frequency,
                    "severity": severity,
                    "implication": implication,
                }
            )

    if normalized:
        return normalized

    # Final fallback to keep API stable even when model output is malformed.
    return [
        {
            "name": f"Theme {idx}",
            "frequency": 1,
            "severity": 3,
            "implication": f"User feedback indicates this issue: {text[:120]}",
        }
        for idx, text in enumerate(feedback_items[:5], start=1)
    ]


def _coerce_recommendation(result: dict, req: RecommendRequest) -> dict:
    sprint_focus_raw = result.get("sprint_focus")
    if not isinstance(sprint_focus_raw, list):
        sprint_focus_raw = result.get("recommendations")
    if not isinstance(sprint_focus_raw, list):
        sprint_focus_raw = []

    normalized_focus = []
    for idx, item in enumerate(sprint_focus_raw[:3], start=1):
        if not isinstance(item, dict):
            continue
        priority_raw = item.get("priority", idx)
        try:
            priority = max(1, int(priority_raw))
        except Exception:
            priority = idx

        feature_name = str(item.get("feature_name") or item.get("title") or f"Recommendation {idx}").strip()
        why_now = str(item.get("why_now") or item.get("reason") or "High-impact theme from user feedback.").strip()
        expected_impact = str(
            item.get("expected_impact") or item.get("impact") or "Improves user experience and retention."
        ).strip()

        what_raw = item.get("what_to_build", [])
        if isinstance(what_raw, str):
            what_to_build = [what_raw.strip()]
        elif isinstance(what_raw, list):
            what_to_build = [str(x).strip() for x in what_raw if str(x).strip()]
        else:
            what_to_build = []
        if not what_to_build:
            what_to_build = ["Ship one scoped improvement", "Measure user impact", "Iterate based on feedback"]

        normalized_focus.append(
            {
                "priority": priority,
                "feature_name": feature_name,
                "why_now": why_now,
                "what_to_build": what_to_build,
                "expected_impact": expected_impact,
            }
        )

    if not normalized_focus:
        for idx, cluster in enumerate(req.clusters[:3], start=1):
            normalized_focus.append(
                {
                    "priority": idx,
                    "feature_name": cluster.name,
                    "why_now": f"{cluster.name} is impacting users with severity {cluster.severity}.",
                    "what_to_build": [
                        f"Instrument and monitor {cluster.name.lower()} metrics",
                        f"Ship one scoped fix for {cluster.name.lower()}",
                        "Validate impact with a rapid user feedback loop",
                    ],
                    "expected_impact": f"Reduce pain around {cluster.name.lower()} and improve retention.",
                }
            )

    defer_raw = result.get("defer", [])
    defer = [str(x).strip() for x in defer_raw] if isinstance(defer_raw, list) else []
    if not defer:
        defer = [c.name for c in req.clusters[3:]]

    confidence_raw = result.get("confidence", "low")
    if isinstance(confidence_raw, str):
        confidence = confidence_raw.lower().strip()
    elif isinstance(confidence_raw, (int, float)):
        confidence = "high" if confidence_raw >= 0.75 else "medium" if confidence_raw >= 0.5 else "low"
    else:
        confidence = "low"
    if confidence not in {"high", "medium", "low"}:
        confidence = "low"

    confidence_note = str(
        result.get("confidence_note")
        or "Recommendation confidence normalized from model output."
    ).strip()

    return {
        "sprint_focus": normalized_focus,
        "defer": defer,
        "confidence": confidence,
        "confidence_note": confidence_note,
        "raw_output": str(result.get("raw_output", "")),
    }


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    started = time.perf_counter()
    logger.info("Request start: POST /api/analyze")

    feedback_items = _normalize_feedback(req.feedback)
    if len(feedback_items) < 2:
        raise HTTPException(
            status_code=400,
            detail={"error": "ValidationError", "details": "Provide at least 2 feedback items"},
        )

    user_prompt = f"Source={req.source}\nFeedback:\n" + "\n".join(f"- {item}" for item in feedback_items)
    result = await call_llm_json(CLUSTER_PROMPT, user_prompt)

    clusters = _coerce_clusters(result, feedback_items)
    if not clusters:
        raise HTTPException(
            status_code=502,
            detail={"error": "ModelOutputError", "details": "Model did not return usable clusters"},
        )

    latency_ms = int((time.perf_counter() - started) * 1000)
    logger.info("POST /api/analyze completed in %sms", latency_ms)
    return {"clusters": clusters}


@router.post("/recommend", response_model=RecommendResponse)
async def recommend(req: RecommendRequest):
    started = time.perf_counter()
    logger.info("Request start: POST /api/recommend")

    if not req.clusters:
        raise HTTPException(
            status_code=400,
            detail={"error": "ValidationError", "details": "clusters payload is required"},
        )

    user_prompt = f"Source={req.source}\nClusters:\n{json.dumps([c.model_dump() for c in req.clusters])}"
    result = await call_llm_json(RECOMMEND_PROMPT, user_prompt)
    result = _coerce_recommendation(result, req)

    latency_ms = int((time.perf_counter() - started) * 1000)
    logger.info("POST /api/recommend completed in %sms", latency_ms)
    return result
