import httpx
from app.services import elevenlabs


def test_timestamped_synthesis_preserves_voice_and_alignment(monkeypatch):
    monkeypatch.setattr(elevenlabs, "ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setattr(elevenlabs, "ELEVENLABS_VOICE_ID", "test-voice")
    alignment = {"characters": ["a"], "character_start_times_seconds": [0], "character_end_times_seconds": [0.2]}
    calls = []
    def post(url, **kwargs):
        calls.append((url, kwargs))
        return httpx.Response(200, json={"audio_base64": "SUQz", "normalized_alignment": alignment})
    monkeypatch.setattr(elevenlabs.httpx, "post", post)
    assert elevenlabs.text_to_speech_aligned("Gill speaks") == {"audio_base64": "SUQz", "alignment": alignment}
    assert calls[0][0].endswith("/test-voice/with-timestamps")
    assert calls[0][1]["json"]["text"] == "Ghill speaks"
