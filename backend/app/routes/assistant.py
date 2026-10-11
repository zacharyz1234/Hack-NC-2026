"""Gill Gates chat API. Login is optional (guests can chat); each chat only answers to whoever opened it.

Request/response shapes are documented for the frontend in docs/GILL_GATES_FRONTEND_CONTRACT.md.
"""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.assistant import orchestrator, sessions
from app.auth import get_optional_user
from app.services import elevenlabs, gemini

router = APIRouter(prefix="/assistant", tags=["assistant"])

UNAVAILABLE = "Gill can't reach the AI service right now. Everything else in the app still works."


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=16000)


class ConsentIn(BaseModel):
    request_id: str
    decisions: dict[str, Literal["once", "chat", "always", "deny"]]


class SubmitIn(BaseModel):
    call_id: str
    value: dict | None = None
    dismissed: bool = False


class EventIn(BaseModel):
    type: Literal["user_saved"]
    target: Literal["budget", "savings_goal", "expense"]


def _user_id(user: dict | None) -> int | None:
    return user["id"] if user else None


def _load(session_id: str, user: dict | None) -> sessions.Session:
    session = sessions.load(session_id, _user_id(user))
    if session is None:
        raise HTTPException(status_code=404, detail="Chat not found or expired")
    return session


def _turn(session_id: str, user: dict | None, step, *args) -> dict:
    with sessions.lock(session_id):
        session = _load(session_id, user)
        try:
            return step(session, *args)
        except orchestrator.TurnError as exc:
            raise HTTPException(status_code=exc.status, detail=exc.detail) from None
        except gemini.GeminiUnavailable as exc:
            raise HTTPException(status_code=503, detail=exc.public_message or UNAVAILABLE) from None


@router.post("/sessions")
def create_session(user: dict | None = Depends(get_optional_user)):
    return orchestrator.create_session(_user_id(user))


@router.post("/sessions/{session_id}/messages")
def send_message(session_id: str, body: MessageIn, user: dict | None = Depends(get_optional_user)):
    return _turn(session_id, user, orchestrator.send_message, body.text)


@router.post("/sessions/{session_id}/consent")
def answer_consent(session_id: str, body: ConsentIn, user: dict | None = Depends(get_optional_user)):
    return _turn(session_id, user, orchestrator.answer_consent, body.request_id, body.decisions)


@router.post("/sessions/{session_id}/submit")
def submit(session_id: str, body: SubmitIn, user: dict | None = Depends(get_optional_user)):
    return _turn(session_id, user, orchestrator.submit, body.call_id, body.value, body.dismissed)


@router.post("/sessions/{session_id}/events", status_code=204)
def app_event(session_id: str, body: EventIn, user: dict | None = Depends(get_optional_user)):
    with sessions.lock(session_id):
        orchestrator.note_user_saved(_load(session_id, user), body.target)


@router.post("/sessions/{session_id}/messages/{message_id}/speech")
def speech(session_id: str, message_id: str, user: dict | None = Depends(get_optional_user)):
    """Reads one of Gill's own messages aloud. It never voices arbitrary text."""
    text = orchestrator.message_text(_load(session_id, user), message_id)
    if text is None:
        raise HTTPException(status_code=404, detail="Message not found")
    try:
        audio = elevenlabs.text_to_speech(elevenlabs.speakable(text))
    except elevenlabs.VoiceUnavailable:
        raise HTTPException(status_code=503, detail="Gill's voice isn't available right now.") from None
    return Response(content=audio, media_type="audio/mpeg")


@router.post("/sessions/{session_id}/messages/{message_id}/speech-aligned")
def speech_aligned(session_id: str, message_id: str, user: dict | None = Depends(get_optional_user)):
    """Return audio and character timestamps for one of Gill's own replies."""
    text = orchestrator.message_text(_load(session_id, user), message_id)
    if text is None:
        raise HTTPException(status_code=404, detail="Message not found")
    try:
        return elevenlabs.text_to_speech_aligned(elevenlabs.speakable(text))
    except elevenlabs.VoiceUnavailable:
        raise HTTPException(status_code=503, detail="Gill's voice isn't available right now.") from None


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, user: dict | None = Depends(get_optional_user)):
    if not sessions.delete(session_id, _user_id(user)):
        raise HTTPException(status_code=404, detail="Chat not found or expired")
