import os

from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
# Used for a request when GEMINI_MODEL is overloaded (503/504/429). Set to "" to turn off.
GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")  # placeholder premade voice
ELEVENLABS_MODEL_ID = os.getenv("ELEVENLABS_MODEL_ID", "eleven_flash_v2_5")
NESSIE_API_KEY = os.getenv("NESSIE_API_KEY", "")
TWELVE_DATA_API_KEY = os.getenv("TWELVE_DATA_API_KEY", "")
# Set this to the actual plan allowance. The hourly full-market scan fetches
# all listed stocks in one burst, plus capacity for searches and selected stocks.
TWELVE_DATA_CREDITS_PER_MINUTE = int(os.getenv("TWELVE_DATA_CREDITS_PER_MINUTE", "8"))
DB_PATH = os.getenv("DB_PATH", "app.db")

# Frontend origins allowed by CORS: local dev servers plus Lovable previews/deploys
CORS_ORIGIN_REGEX = os.getenv(
    "CORS_ORIGIN_REGEX",
    r"http://(localhost|127\.0\.0\.1):\d+|https://[a-z0-9-]+\.lovable\.app|https://[a-z0-9-]+\.lovableproject\.com",
)

# Gill Gates chats (and their "this chat" consents) are deleted after this much inactivity
ASSISTANT_SESSION_TTL_HOURS = int(os.getenv("ASSISTANT_SESSION_TTL_HOURS", "24"))
