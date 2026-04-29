import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routes.analyze import router as analyze_router
from app.services.llm import MODEL

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("kplor-api")

app = FastAPI(title="Kplor Insight Engine API", version="2.0.0")

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:8080")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin, "http://localhost:5173"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router)


@app.middleware("http")
async def no_store_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL}


@app.exception_handler(HTTPException)
async def handle_http_exception(_: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail and "details" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "RequestError", "details": str(exc.detail)},
    )


@app.exception_handler(Exception)
async def handle_unexpected_exception(_: Request, exc: Exception):
    logger.exception("Unhandled server error")
    return JSONResponse(
        status_code=500,
        content={"error": "InternalServerError", "details": str(exc)},
    )
