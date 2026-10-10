"""Privacy settings for Gill Gates: see what Gill may read, and turn it off."""
from fastapi import APIRouter, Depends, HTTPException

from app.assistant import consent
from app.assistant.scopes import SCOPES
from app.auth import require_user

router = APIRouter(prefix="/consents", tags=["consents"])


@router.get("")
def list_consents(user: dict = Depends(require_user)):
    return {"consents": consent.statuses(user["id"])}


@router.delete("/{scope}", status_code=204)
def revoke(scope: str, user: dict = Depends(require_user)):
    """Stops future reads immediately and clears chats that already used this data."""
    if scope not in SCOPES:
        raise HTTPException(status_code=404, detail="Unknown data type")
    consent.revoke(user["id"], scope)
