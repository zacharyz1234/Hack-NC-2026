from fastapi import APIRouter, Depends, HTTPException

from app.assistant import periods
from app.auth import get_optional_user
from app.services import peer_budgets as peers

router = APIRouter(prefix="/peer-budgets", tags=["fictional peer budgets"])


class ComparisonIn(peers.PeerArgs):
    demo_summary: peers.DemoSummary | None = None


@router.post("/matches")
def matches(body: peers.MatchArgs):
    return peers.matches(body, periods.today())


@router.post("/compare")
def compare(body: ComparisonIn, user: dict | None = Depends(get_optional_user)):
    try:
        other = peers.peer(body.profile_id, body.month, periods.today())
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from None
    if user:
        own = peers.student_summary(user["id"], body.month, periods.today())
    elif body.demo_summary is not None:
        own = peers.demo_summary(body.demo_summary)
    else:
        raise HTTPException(422, "Guests must supply the labeled local demo summary")
    return peers.compare(own, other)
