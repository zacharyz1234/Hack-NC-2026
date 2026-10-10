"""The Gemini wrapper's fallback: a busy primary model hands the request to GEMINI_FALLBACK_MODEL."""
import pytest
from google.genai import errors

from app.services import gemini


class FakeModels:
    def __init__(self, failures: dict[str, int]):
        self.failures = failures  # model -> HTTP status it fails with
        self.tried: list[str] = []

    def generate_content(self, *, model, contents, config=None):
        self.tried.append(model)
        if model in self.failures:
            code = self.failures[model]
            raise errors.APIError(code, {"error": {"code": code, "message": "busy", "status": "UNAVAILABLE"}})
        return f"answer from {model}"


@pytest.fixture
def models(monkeypatch):
    def install(failures):
        fake = FakeModels(failures)
        monkeypatch.setattr(gemini, "_get_client", lambda: type("C", (), {"models": fake})())
        monkeypatch.setattr(gemini, "GEMINI_MODEL", "primary")
        monkeypatch.setattr(gemini, "GEMINI_FALLBACK_MODEL", "fallback")
        return fake

    return install


def test_busy_primary_falls_back(models):
    fake = models({"primary": 503})
    assert gemini._generate("hi") == "answer from fallback"
    assert fake.tried == ["primary", "fallback"]


def test_rate_limited_primary_falls_back(models):
    fake = models({"primary": 429})
    assert gemini._generate("hi") == "answer from fallback"
    assert fake.tried == ["primary", "fallback"]


def test_other_errors_do_not_fall_back(models):
    fake = models({"primary": 400})
    with pytest.raises(gemini.GeminiUnavailable):
        gemini._generate("hi")
    assert fake.tried == ["primary"]


def test_both_busy_is_unavailable(models):
    models({"primary": 503, "fallback": 503})
    with pytest.raises(gemini.GeminiUnavailable):
        gemini._generate("hi")


def test_no_fallback_configured(models, monkeypatch):
    fake = models({"primary": 503})
    monkeypatch.setattr(gemini, "GEMINI_FALLBACK_MODEL", "")
    with pytest.raises(gemini.GeminiUnavailable):
        gemini._generate("hi")
    assert fake.tried == ["primary"]
