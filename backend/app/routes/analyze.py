import asyncio
import json
import logging
import time
import hashlib
from typing import List

from fastapi import APIRouter, HTTPException

from app.models.schema import AnalyzeRequest, AnalyzeResponse, RecommendRequest, RecommendResponse
from app.services.llm import call_llm_json

logger = logging.getLogger("kplor-api")
router = APIRouter(prefix="/api", tags=["analysis"])

CLUSTER_PROMPT = (
    "You are a product manager analyzing feedback for an AI edtech startup.\n\n"
    "Group feedback into 4-6 PRODUCT PAIN POINT CLUSTERS.\n\n"
    "STRICT RULES:\n"
    "- Never use generic names like Theme 1, Theme 2, Category A.\n"
    "- Cluster names must be specific product problems.\n\n"
    "Good labels:\n"
    "Video Generation Latency\n"
    "Admin Workflow Friction\n"
    "Pricing Transparency Issues\n"
    "Content Personalization Gaps\n"
    "Platform Reliability Bugs\n\n"
    "Bad labels:\n"
    "Theme 1\n"
    "Theme 2\n"
    "General Issues\n\n"
    "Multiple feedback responses may belong in the same cluster.\n"
    "Cluster by shared problem, not one response per cluster.\n\n"
    "Return valid JSON only:\n"
    "{\"clusters\":[{\"name\":\"\",\"frequency\":0,\"severity\":1}]}"
)

RECOMMEND_PROMPT = (
    "You are a product engineer. Given these feedback clusters, return valid JSON with: "
    "{sprint_focus:[{priority, feature_name, why_now, what_to_build, expected_impact}], "
    "defer:[string], confidence, confidence_note}. "
    "Return ONLY JSON."
)

CACHE_TTL_SECONDS = 300
_analyze_cache = {}
_GENERIC_LABEL_PREFIXES = ("theme", "category")
_GENERIC_LABELS = {"general issues", "miscellaneous", "other", "others"}


def _normalize_feedback(raw_feedback: List[str]) -> List[str]:
    cleaned = [item.strip()[:300] for item in raw_feedback if item and item.strip()]
    return cleaned[:20]


def _cluster_implication(name: str) -> str:
    lname = name.lower()
    if "latency" in lname or "slow" in lname or "speed" in lname:
        return "Users are blocked by slow generation, reducing completion and retention."
    if "reliability" in lname or "crash" in lname or "bug" in lname or "fail" in lname:
        return "Stability gaps are breaking trust and causing drop-off."
    if "pricing" in lname or "cost" in lname:
        return "Unclear pricing creates buying friction and slows conversions."
    if "admin" in lname or "workflow" in lname or "onboarding" in lname:
        return "Operational friction slows adoption for admins and teams."
    if "mobile" in lname or "ios" in lname or "android" in lname:
        return "Mobile usability gaps reduce access and engagement."
    if "integration" in lname or "lms" in lname:
        return "Missing integrations block rollout in target organizations."
    return "This pain point materially impacts user experience and product adoption."


def _analyze_cache_key(source: str, feedback_items: List[str]) -> str:
    raw = f"{source}::{json.dumps(feedback_items, ensure_ascii=False)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _is_semantic_label(name: str) -> bool:
    normalized = name.strip().lower()
    if not normalized:
        return False
    if any(normalized.startswith(prefix) for prefix in _GENERIC_LABEL_PREFIXES):
        return False
    if normalized in _GENERIC_LABELS:
        return False
    if len(normalized.split()) < 2:
        return False
    return True


def _is_valid_cluster_result(clusters: List[dict], feedback_items: List[str]) -> bool:
    if not (4 <= len(clusters) <= 6):
        return False
    if not all(_is_semantic_label(c.get("name", "")) for c in clusters):
        return False
    if any(int(c.get("frequency", 0)) < 1 for c in clusters):
        return False
    if any(int(c.get("severity", 0)) < 1 or int(c.get("severity", 0)) > 5 for c in clusters):
        return False
    if len(feedback_items) >= 4 and all(int(c.get("frequency", 1)) == 1 for c in clusters):
        return False
    return True


def _heuristic_clusters(feedback_items: List[str]) -> List[dict]:
    buckets = {
        "Video Generation Latency": {"frequency": 0, "severity": 4},
        "Platform Reliability Bugs": {"frequency": 0, "severity": 5},
        "Admin Workflow Friction": {"frequency": 0, "severity": 3},
        "Pricing Transparency Issues": {"frequency": 0, "severity": 3},
        "Content Personalization Gaps": {"frequency": 0, "severity": 3},
        "Mobile Experience Issues": {"frequency": 0, "severity": 3},
    }
    for text in feedback_items:
        t = text.lower()
        if ("slow" in t or "latency" in t or "takes too long" in t) and ("video" in t or "generation" in t):
            buckets["Video Generation Latency"]["frequency"] += 1
        elif "crash" in t or "bug" in t or "failed" in t or "error" in t or "reliab" in t:
            buckets["Platform Reliability Bugs"]["frequency"] += 1
        elif "pricing" in t or "quote" in t or "cost" in t:
            buckets["Pricing Transparency Issues"]["frequency"] += 1
        elif "admin" in t or "workflow" in t or "onboarding" in t or "cohort" in t:
            buckets["Admin Workflow Friction"]["frequency"] += 1
        elif "personal" in t or "factual" in t or "quality" in t or "voice" in t:
            buckets["Content Personalization Gaps"]["frequency"] += 1
        elif "mobile" in t or "ios" in t or "android" in t:
            buckets["Mobile Experience Issues"]["frequency"] += 1
        else:
            buckets["Admin Workflow Friction"]["frequency"] += 1

    clusters = []
    for name, payload in buckets.items():
        if payload["frequency"] > 0:
            clusters.append(
                {
                    "name": name,
                    "frequency": payload["frequency"],
                    "severity": payload["severity"],
                    "implication": _cluster_implication(name),
                }
            )
    return clusters[:6]


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
        for idx, item in enumerate(candidates[:6], start=1):
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("theme") or f"Cluster {idx}").strip()
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
            normalized.append(
                {
                    "name": name,
                    "frequency": frequency,
                    "severity": severity,
                    "implication": _cluster_implication(name),
                }
            )

    if normalized:
        return normalized

    return _heuristic_clusters(feedback_items)


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

    cache_key = _analyze_cache_key(req.source, feedback_items)
    cached = _analyze_cache.get(cache_key)
    now = time.time()
    if cached and cached["expires_at"] > now:
        logger.info("Analyze cache hit")
        return {"clusters": cached["clusters"]}

    user_prompt = f"Source={req.source}\nFeedback:\n" + "\n".join(f"- {item}" for item in feedback_items)
    clusters: List[dict] = []
    for attempt in range(1, 4):
        result = await call_llm_json(CLUSTER_PROMPT, user_prompt)
        clusters = _coerce_clusters(result, feedback_items)
        if _is_valid_cluster_result(clusters, feedback_items):
            _analyze_cache[cache_key] = {
                "clusters": clusters,
                "expires_at": time.time() + CACHE_TTL_SECONDS,
            }
            break
        logger.warning("Rejected cluster output on attempt %s: %s", attempt, json.dumps(result)[:300])
        if attempt < 3:
            await asyncio.sleep(2 ** (attempt - 1))
            continue
        clusters = _heuristic_clusters(feedback_items)

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
