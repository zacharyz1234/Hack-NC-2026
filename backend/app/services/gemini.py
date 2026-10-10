"""Our wrapper around Gemini (google-genai SDK, generate_content).

We call generate_content with automatic function calling turned off: Gemini only *proposes* tool
calls, and app/assistant/orchestrator.py decides whether each one may run. We also keep the
transcript ourselves (stateless calls) instead of using the Interactions API, which stores
conversations on Google's side by default; holding it here is what lets "turn off access" remove
data from future requests.
"""
import logging

import httpx
from google import genai
from google.genai import errors, types

from app.config import GEMINI_API_KEY, GEMINI_FALLBACK_MODEL, GEMINI_MODEL

log = logging.getLogger(__name__)

# Busy ("high demand") or slow: worth a quick retry on the same model.
TRANSIENT = (500, 503, 504)
# Any of these after retries (429 = rate limit/quota, not worth retrying): try the fallback model.
OVERLOADED = (429, *TRANSIENT)


class GeminiUnavailable(Exception):
    """Gemini couldn't be reached or isn't configured. The rest of the app keeps working."""


_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if not GEMINI_API_KEY:
        raise GeminiUnavailable("GEMINI_API_KEY is not set")
    if _client is None:
        _client = genai.Client(
            api_key=GEMINI_API_KEY,
            http_options=types.HttpOptions(
                timeout=60_000,
                retry_options=types.HttpRetryOptions(
                    attempts=3, initial_delay=1.0, max_delay=4.0, http_status_codes=list(TRANSIENT)
                ),
            ),
        )
    return _client


def _generate(contents, config: types.GenerateContentConfig | None = None) -> types.GenerateContentResponse:
    """generate_content on GEMINI_MODEL, retried by the SDK, then once on GEMINI_FALLBACK_MODEL if still busy.

    Switching models mid-chat is safe: the fallback accepts the primary model's thought signatures.
    """
    models = [GEMINI_MODEL] + ([GEMINI_FALLBACK_MODEL] if GEMINI_FALLBACK_MODEL else [])
    for i, model in enumerate(models):
        try:
            return _get_client().models.generate_content(model=model, contents=contents, config=config)
        except errors.APIError as exc:
            if exc.code not in OVERLOADED or i == len(models) - 1:
                raise GeminiUnavailable(str(exc)) from exc
            log.warning("Gemini %s unavailable (%s); trying %s", model, exc.code, models[i + 1])
        except httpx.HTTPError as exc:
            raise GeminiUnavailable(str(exc)) from exc
    raise GeminiUnavailable("no Gemini model configured")


def generate(prompt: str) -> str:
    """One-shot text generation: no tools, no history. Don't put student financial data in `prompt`."""
    return _generate(prompt).text or ""


def chat_step(
    system: str, contents: list[types.Content], tools: list[types.FunctionDeclaration]
) -> types.Content:
    """One model turn. Returns Gemini's reply (text and/or function calls) exactly as sent.

    Keep the returned Content intact in the transcript: Gemini 3 attaches thought signatures to its
    function calls and expects them back on the next request.
    """
    response = _generate(
        contents,
        types.GenerateContentConfig(
            system_instruction=system,
            tools=[types.Tool(function_declarations=tools)],
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW),
        ),
    )
    candidate = response.candidates[0] if response.candidates else None
    if candidate is None or candidate.content is None or not candidate.content.parts:
        # Blocked or empty (e.g. a safety stop): answer politely instead of failing the request.
        return types.Content(
            role="model",
            parts=[types.Part.from_text(text="I can't help with that one, but I'm happy to help with budgeting!")],
        )
    return candidate.content
