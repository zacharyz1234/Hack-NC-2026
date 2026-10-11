from fastapi import APIRouter

router = APIRouter()
### Made by Bryce - simple health check

@router.get("/")
def root():
    """This server is the API only; the app itself is the frontend dev server."""
    return {
        "message": "Bowl Street Journal API. Open the app at http://localhost:8080; API docs are at /docs.",
        "app": "http://localhost:8080",
        "docs": "/docs",
    }


@router.get("/health")
def health():
    return {"status": "ok"}
