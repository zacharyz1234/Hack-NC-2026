from fastapi import APIRouter

router = APIRouter()
### Made by Bryce - simple health check

@router.get("/health")
def health():
    return {"status": "ok"}
