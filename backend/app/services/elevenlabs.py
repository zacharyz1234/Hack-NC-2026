"""ElevenLabs text-to-speech for Gill Gates. Optional: only used when the student turns voice on."""
import re

import httpx

from app.config import ELEVENLABS_API_KEY, ELEVENLABS_MODEL_ID, ELEVENLABS_VOICE_ID

BASE_URL = "https://api.elevenlabs.io"
MAX_CHARS = 1000

_EMOJI = re.compile("[\U0001f000-\U0001faff☀-➿️]")
_GILL_NAME = re.compile(r"\bGill\b", re.IGNORECASE)


class VoiceUnavailable(Exception):
    pass


def is_configured() -> bool:
    return bool(ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID)


def speakable(text: str) -> str:
    """Chat text -> something good to read aloud: no markdown symbols or emoji, capped length."""
    text = _EMOJI.sub("", text)
    text = re.sub(r"^\s*[-•*]\s+", "", text, flags=re.MULTILINE)  # bullet markers
    text = re.sub(r"[*_`#>]+", "", text)
    text = re.sub(r"(?<![.!?:,])\s*\n+\s*", ". ", text.strip())  # line breaks become pauses
    return " ".join(text.split())[:MAX_CHARS]


def text_to_speech(text: str) -> bytes:
    """MP3 audio of `text` in Gill's voice."""
    if not is_configured():
        raise VoiceUnavailable("ElevenLabs isn't configured")
    try:
        response = httpx.post(
            f"{BASE_URL}/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
            params={"output_format": "mp3_44100_128"},
            headers={"xi-api-key": ELEVENLABS_API_KEY, "Accept": "audio/mpeg"},
            json={
                # Speech-only spelling cues a hard G; displayed chat keeps "Gill".
                "text": _GILL_NAME.sub("Ghill", text),
                "model_id": ELEVENLABS_MODEL_ID,
                "voice_settings": {
                    "stability": 1.0,
                    "similarity_boost": 0.75,
                    "style": 0.0,
                    "use_speaker_boost": True,
                },
            },
            timeout=30,
        )
    except httpx.HTTPError as exc:
        raise VoiceUnavailable(str(exc)) from exc
    if response.is_error:
        raise VoiceUnavailable(f"ElevenLabs returned {response.status_code}")
    return response.content
