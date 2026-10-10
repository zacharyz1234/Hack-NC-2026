## Claude and Bryce
"""Gill Gates' turn loop.

1. The student's message goes into the chat transcript.
2. Gemini replies with text and/or tool calls (gemini.chat_step never runs tools itself).
3. Each call is validated, consent-checked and run here. A call that needs the student (an input
   card, or a permission decision) pauses the turn; submit() and answer_consent() resume it.
4. Results go back to Gemini, which continues until it answers in plain text (MAX_MODEL_CALLS).

Everything the frontend shows comes back as a list of events; see
docs/GILL_GATES_FRONTEND_CONTRACT.md for their exact shape.
"""
import logging
import secrets
from collections.abc import Iterable

from google.genai import types
from pydantic import ValidationError

from app.assistant import audit, consent, periods, prompts, sessions, tools
from app.assistant.scopes import CONSENT_FOOTER, CONSENT_OPTIONS, SCOPES, SHARED_WITH, WINDOWED
from app.assistant.sessions import Session
from app.services import elevenlabs, gemini

log = logging.getLogger(__name__)

MAX_MODEL_CALLS = 6
MAX_TRANSCRIPT_ENTRIES = 60

GREETING = (
    "Hi, I'm Gill! 🐟 I can help you plan a budget, find places to save, or explain money stuff. "
    "I only look at your financial info if you say it's okay."
)
SUGGESTIONS = [
    "Help me plan this month's budget",
    "Where could I cut spending?",
    "How much can I safely set aside?",
    "How big should my emergency fund be?",
]
FALLBACK = "Sorry, I got my fins tangled on that one. Could you ask it another way?"

NOT_AVAILABLE_GUEST = {
    "status": "not_available",
    "reason": "guest",
    "message": "The student is a guest, so there's no saved financial data. "
    "Ask them for the numbers instead (for example with show_amount_form).",
}

SAVED_NOTICES = {
    "budget": "The student saved the budget from your card with its Save button.",
    "savings_goal": "The student created the savings goal from your card.",
    "expense": "The student added the expense from your card.",
}


class TurnError(Exception):
    """A request the student's client got wrong (stale card, missing choice). Maps to an HTTP error."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


# ---------- entry points (called by app/routes/assistant.py) ----------


def create_session(user_id: int | None) -> dict:
    """Opening Gill: a fixed greeting. No model call and no data read."""
    session = sessions.create(user_id, prompts.PROMPT_VERSION)
    audit.log("session_created", user_id=user_id, session_id=session.id)
    return {
        "session_id": session.id,
        "state": "ready",
        "signed_in": user_id is not None,
        "voice_available": elevenlabs.is_configured(),
        "suggestions": SUGGESTIONS,
        "events": [{"type": "message", "message_id": "greeting", "text": GREETING}],
    }


def send_message(session: Session, text: str) -> dict:
    events = [{"type": "notice", "text": notice} for notice in session.meta.pop("ui_notices", [])]
    parts, scopes = _close_pending(session)
    parts += [types.Part.from_text(text=f"[App notice] {notice}") for notice in session.meta.pop("notices", [])]
    parts.append(types.Part.from_text(text=text))
    session.meta["question"] = text
    session.meta["turn_denied"] = []
    _append(session, "user", types.Content(role="user", parts=parts), scopes)
    return _run(session, events)


def answer_consent(session: Session, request_id: str, decisions: dict[str, str]) -> dict:
    request = (session.pending or {}).get("consent")
    if not request or request["request_id"] != request_id:
        raise TurnError(409, "This permission request is no longer waiting for an answer.")
    if set(decisions) != set(request["scopes"]):
        raise TurnError(422, "Choose an option for every item on the card.")

    ctx = _context(session)
    declined = session.meta.setdefault("declined", [])
    allowed_once: set[str] = set()
    for scope in request["scopes"]:
        choice = decisions[scope]
        if choice == "deny":
            session.meta.setdefault("turn_denied", []).append(scope)
            if scope not in declined:
                declined.append(scope)
            audit.log("consent_denied", user_id=ctx.user_id, session_id=session.id, scope=scope)
            continue
        if choice == "once":
            allowed_once.add(scope)
        else:
            consent.grant(ctx.user_id, session.id, scope, choice, request["lookbacks"][scope])
        if scope in declined:
            declined.remove(scope)
        audit.log("consent_granted", user_id=ctx.user_id, session_id=session.id, scope=scope, outcome=choice)
    session.pending["consent"] = None

    events: list[dict] = []
    for call in session.pending["calls"]:
        if call["status"] != "awaiting_consent":
            continue
        refused = [s for s in call["missing"] if decisions[s] == "deny"]
        # Re-check on the server: "once" covers only this request's calls; anything else needs a live grant.
        allowed = all(
            s in allowed_once or consent.is_granted(ctx.user_id, session.id, s, call["lookback_days"])
            for s in call["scopes"]
        )
        if refused or not allowed:
            call["status"], call["result"] = "done", _denied(refused or call["missing"])
            continue
        spec = tools.TOOLS[call["name"]]
        _execute(ctx, spec, spec.args.model_validate(call["args"]), call, events)
    return _resume(session, events)


def submit(session: Session, call_id: str, value: dict | None, dismissed: bool) -> dict:
    calls = (session.pending or {}).get("calls", [])
    call = next((c for c in calls if c["call_id"] == call_id and c["status"] == "awaiting_input"), None)
    if call is None:
        raise TurnError(409, "This card isn't waiting for an answer anymore.")
    if dismissed:
        call["result"] = {"status": "dismissed", "message": "The student closed the card without answering."}
    else:
        try:
            call["result"] = tools.TOOLS[call["name"]].submit(call["props"], value or {})
        except ValueError as exc:
            raise TurnError(422, str(exc)) from None
    call["status"] = "done"
    audit.log(
        "card_answered",
        user_id=session.user_id,
        session_id=session.id,
        tool=call["name"],
        outcome="dismissed" if dismissed else "submitted",
    )
    return _resume(session, [])


def note_user_saved(session: Session, target: str) -> None:
    """The student pressed Save/Create/Add on one of Gill's cards. Gill hears about it on its next turn.

    Only the fact is passed on, never the saved amounts.
    """
    session.meta.setdefault("notices", []).append(SAVED_NOTICES[target])
    audit.log("user_saved", user_id=session.user_id, session_id=session.id, tool=target)
    sessions.save(session)


def message_text(session: Session, message_id: str) -> str | None:
    """Text of one of Gill's own messages (for text-to-speech)."""
    if message_id == "greeting":
        return GREETING
    for entry in session.transcript:
        if entry["id"] == message_id and entry["kind"] == "model":
            return _text(types.Content.model_validate(entry["content"])) or None
    return None


# ---------- the loop ----------


def _run(session: Session, events: list[dict]) -> dict:
    ctx = _context(session)
    for _ in range(MAX_MODEL_CALLS):
        reply = gemini.chat_step(_system_prompt(session, ctx), _contents(session), tools.declarations())
        entry = _append(session, "model", reply)
        text = _text(reply)
        if text:
            events.append({"type": "message", "message_id": entry["id"], "text": text})
        function_calls = [part.function_call for part in reply.parts or [] if part.function_call]
        if not function_calls:
            return _finish(session, "ready", events)
        session.pending = {"calls": [_dispatch(ctx, session, fc, events) for fc in function_calls], "consent": None}
        if any(call["status"] != "done" for call in session.pending["calls"]):
            return _pause(session, events)
        _flush(session)

    entry = _append(session, "model", types.Content(role="model", parts=[types.Part.from_text(text=FALLBACK)]))
    events.append({"type": "message", "message_id": entry["id"], "text": FALLBACK})
    return _finish(session, "ready", events)


def _dispatch(ctx: tools.ToolContext, session: Session, function_call: types.FunctionCall, events: list[dict]) -> dict:
    """Decide what one model-requested call may do. The server, not the model, makes every check."""
    call = {
        "call_id": "c_" + secrets.token_urlsafe(6),
        "fc_id": function_call.id,
        "name": (function_call.name or "")[:64],
        "args": dict(function_call.args or {}),
        "status": "done",
        "result": None,
        "scopes": [],
        "missing": [],
        "read_scopes": [],
        "lookback_days": 0,
        "period_label": None,
        "component": None,
        "props": None,
    }
    spec = tools.TOOLS.get(call["name"])
    if spec is None:
        call["result"] = {"error": "unknown_tool", "message": f"There is no tool named {call['name']!r}."}
        _audit_call(ctx, call, "unknown_tool")
        return call
    try:
        args = spec.args.model_validate(call["args"])
    except ValidationError as exc:
        call["result"] = {"error": "invalid_arguments", "details": _brief(exc)}
        _audit_call(ctx, call, "invalid_arguments")
        return call

    call["scopes"] = spec.scopes(args)
    if call["scopes"]:
        period = spec.period(args, ctx.today)
        call["lookback_days"] = period.lookback_days if period else 0
        call["period_label"] = period.label if period else None
        if not ctx.signed_in:
            call["result"] = NOT_AVAILABLE_GUEST
            _audit_call(ctx, call, "not_available")
            return call
        refused = [s for s in call["scopes"] if s in session.meta.get("turn_denied", [])]
        if refused:
            call["result"] = _denied(refused)
            _audit_call(ctx, call, "denied")
            return call
        call["missing"] = [
            s for s in call["scopes"] if not consent.is_granted(ctx.user_id, ctx.session_id, s, call["lookback_days"])
        ]
        if call["missing"]:
            call["status"] = "awaiting_consent"
            _audit_call(ctx, call, "consent_required")
            return call
    return _execute(ctx, spec, args, call, events)


def _execute(ctx: tools.ToolContext, spec: tools.ToolSpec, args, call: dict, events: list[dict]) -> dict:
    call["status"] = "done"
    try:
        outcome = spec.run(ctx, args)
    except tools.ToolError as exc:
        call["result"] = exc.result
        _audit_call(ctx, call, "invalid_arguments")
        return call
    except Exception:
        log.exception("Tool %s failed", spec.name)
        call["result"] = {"error": "tool_failed", "message": "That didn't work. Carry on without it."}
        _audit_call(ctx, call, "error")
        return call

    for scope, label in outcome.reads:
        chip = {"type": "data_access", "scope": scope, "label": label}
        if chip not in events:  # a summary and its chart read the same thing; show it once
            events.append(chip)
    call["read_scopes"] = sorted({scope for scope, _ in outcome.reads})
    if outcome.component:
        call["component"], call["props"] = outcome.component, outcome.props
        events.append(
            {
                "type": "component",
                "call_id": call["call_id"],
                "component": outcome.component,
                "props": outcome.props,
                "awaits_input": spec.kind == "input",
            }
        )
    if spec.kind == "input":
        call["status"] = "awaiting_input"
    else:
        call["result"] = outcome.result
    _audit_call(ctx, call, "ok")
    return call


def _pause(session: Session, events: list[dict]) -> dict:
    waiting = [call for call in session.pending["calls"] if call["status"] == "awaiting_consent"]
    if not waiting:
        return _finish(session, "awaiting_input", events)

    scopes = list(dict.fromkeys(s for call in waiting for s in call["missing"]))
    widest = {s: max((c for c in waiting if s in c["missing"]), key=lambda c: c["lookback_days"]) for s in scopes}
    request_id = "cr_" + secrets.token_urlsafe(6)
    session.pending["consent"] = {
        "request_id": request_id,
        "scopes": scopes,
        "lookbacks": {s: widest[s]["lookback_days"] for s in scopes},
    }
    question = session.meta.get("question", "")
    events.append(
        {
            "type": "consent_request",
            "request_id": request_id,
            "purpose": f"To answer: “{_shorten(question, 120)}”" if question else "To answer your question",
            "shared_with": SHARED_WITH,
            "footer": CONSENT_FOOTER,
            "items": [
                {
                    "scope": s,
                    "title": SCOPES[s].title,
                    "details": SCOPES[s].details,
                    "period_label": widest[s]["period_label"] if s in WINDOWED else None,
                }
                for s in scopes
            ],
            "options": CONSENT_OPTIONS,
        }
    )
    return _finish(session, "awaiting_consent", events)


def _resume(session: Session, events: list[dict]) -> dict:
    if any(call["status"] != "done" for call in session.pending["calls"]):
        state = "awaiting_consent" if session.pending.get("consent") else "awaiting_input"
        return _finish(session, state, events)
    _flush(session)
    return _run(session, events)


def _close_pending(session: Session) -> tuple[list[types.Part], set[str]]:
    """Answer calls still waiting when the student types instead: Gemini needs a result for every call."""
    if not session.pending:
        return [], set()
    calls = session.pending["calls"]
    for call in calls:
        if call["status"] == "awaiting_consent":
            call["result"] = {
                "status": "consent_not_given",
                "message": "The student sent a new message instead of answering the permission request. "
                "Don't assume access.",
            }
        elif call["status"] == "awaiting_input":
            call["result"] = {"status": "skipped", "message": "The student typed a message instead of using this card."}
        call["status"] = "done"
    session.pending = None
    return [_response_part(call) for call in calls], {s for call in calls for s in call["read_scopes"]}


# ---------- helpers ----------


def _context(session: Session) -> tools.ToolContext:
    return tools.ToolContext(user_id=session.user_id, session_id=session.id, today=periods.today())


def _system_prompt(session: Session, ctx: tools.ToolContext) -> str:
    return prompts.system_prompt(
        today=ctx.today,
        signed_in=ctx.signed_in,
        granted=consent.active_grants(ctx.user_id, session.id) if ctx.signed_in else {},
        declined=session.meta.get("declined", []),
        categories=ctx.built_in_names,
    )


def _append(session: Session, kind: str, content: types.Content, scopes: Iterable[str] = ()) -> dict:
    """Add a turn to the transcript, tagged with the consent scopes whose data it carries."""
    session.meta["seq"] = session.meta.get("seq", 0) + 1
    entry = {
        "id": f"m{session.meta['seq']}",
        "kind": kind,
        "content": content.model_dump(mode="json", exclude_none=True),  # keeps thought signatures
        "scopes": sorted(set(scopes)),
    }
    session.transcript.append(entry)
    return entry


def _flush(session: Session) -> None:
    calls = session.pending["calls"]
    content = types.Content(role="user", parts=[_response_part(call) for call in calls])
    _append(session, "tool", content, {s for call in calls for s in call["read_scopes"]})
    session.pending = None


def _response_part(call: dict) -> types.Part:
    return types.Part(
        function_response=types.FunctionResponse(id=call["fc_id"], name=call["name"], response=call["result"])
    )


def _contents(session: Session) -> list[types.Content]:
    _trim(session)
    return [types.Content.model_validate(entry["content"]) for entry in session.transcript]


def _trim(session: Session) -> None:
    """Bound long chats by dropping the oldest exchanges, never splitting a tool call from its result."""
    while len(session.transcript) > MAX_TRANSCRIPT_ENTRIES:
        starts = [
            i
            for i, entry in enumerate(session.transcript)
            if i > 0 and entry["kind"] == "user" and not any("function_response" in p for p in entry["content"]["parts"])
        ]
        if not starts:
            return
        del session.transcript[: starts[0]]


def _finish(session: Session, state: str, events: list[dict]) -> dict:
    session.state = state
    sessions.save(session)
    return {"session_id": session.id, "state": state, "events": events}


def _text(content: types.Content) -> str:
    return "".join(part.text for part in content.parts or [] if part.text and not part.thought).strip()


def _denied(scopes: list[str]) -> dict:
    return {
        "status": "consent_denied",
        "scopes": scopes,
        "message": "The student chose not to share this. Offer a manual route, and don't ask for it again "
        "in this chat unless they bring it up.",
    }


def _brief(exc: ValidationError) -> list[dict]:
    return [{"field": ".".join(map(str, e["loc"])) or "(arguments)", "problem": e["msg"]} for e in exc.errors()[:5]]


def _audit_call(ctx: tools.ToolContext, call: dict, outcome: str) -> None:
    audit.log(
        "tool_call",
        user_id=ctx.user_id,
        session_id=ctx.session_id,
        tool=call["name"],
        scope=",".join(call["scopes"]) or None,
        outcome=outcome,
    )


def _shorten(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"
