import os

from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
NESSIE_API_KEY = os.getenv("NESSIE_API_KEY", "")
DB_PATH = os.getenv("DB_PATH", "app.db")
