import asyncio
import hashlib
import json
import logging
import os
import re
import time
from typing import Any, Dict

import httpx
from fastapi import HTTPException

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
MODEL = "meta/llama-3.1-8b-instruct"
MAX_RETRIES = 3
TIMEOUT_SECONDS = 60
TEMPERATURE = 0.2
MAX_TOKENS = 300

logger = logging.getLogger("kplor-api")
_response_cache: Dict[str, Dict[str, Any]] = {}


def _cache_key(system_prompt: str, user_prompt: str) -> str:
    raw = f"{MODEL}::{system_prompt}::{user_prompt}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _safe_parse_json(raw_text: str) -> Dict[str, Any]:
    clean = re.sub(r"```json\s*", "", raw_text, flags=re.IGNORECASE)
    clean = re.sub(r"```\s*", "", clean).strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        # Fallback: try extracting the largest JSON object from noisy model text.
        match = re.search(r"\{.*\}", clean, flags=re.DOTALL)
        if match:
            candidate = match.group(0)
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass
        logger.error("LLM malformed JSON: %s", raw_text[:250])
        return {"raw_output": raw_text, "error": "Malformed JSON from model"}


async def call_llm_json(system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail={"error": "ConfigurationError", "details": "NVIDIA_API_KEY is not set"},
        )

    key = _cache_key(system_prompt, user_prompt)
    if key in _response_cache:
        return _response_cache[key]

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    last_error = "Unknown NVIDIA error"
    for attempt in range(1, MAX_RETRIES + 1):
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(base_url=NVIDIA_BASE_URL, timeout=TIMEOUT_SECONDS) as client:
                resp = await client.post("/chat/completions", headers=headers, json=payload)
            latency_ms = int((time.perf_counter() - started) * 1000)
            logger.info("Model latency: %sms (attempt %s)", latency_ms, attempt)

            if not resp.is_success:
                last_error = f"NVIDIA API {resp.status_code}: {resp.text[:200]}"
                logger.error(last_error)
            else:
                data = resp.json()
                raw = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                parsed = _safe_parse_json(raw)
                _response_cache[key] = parsed
                return parsed
        except httpx.TimeoutException:
            last_error = "NVIDIA request timed out"
            logger.error("%s on attempt %s", last_error, attempt)
        except httpx.RequestError as exc:
            last_error = f"NVIDIA network error: {str(exc)}"
            logger.error("%s on attempt %s", last_error, attempt)
        except Exception as exc:
            last_error = f"Unexpected model error: {str(exc)}"
            logger.exception("Unexpected model call failure")

        if attempt < MAX_RETRIES:
            await asyncio.sleep(2 ** (attempt - 1))

    raise HTTPException(
        status_code=502,
        detail={"error": "LLMServiceError", "details": last_error},
    )
