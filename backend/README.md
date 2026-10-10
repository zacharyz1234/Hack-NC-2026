# Backend

Python (FastAPI + sqlite3) API for Hack-NC-2026. Integrates Gemini, ElevenLabs, and Nessie.

```bash
pip install -r requirements.txt
cp .env.example .env   # fill in keys
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

## Gill Gates (the AI assistant)

Read `../docs/GILL_GATES_DESIGN.md` for how it works and `../docs/GILL_GATES_FRONTEND_CONTRACT.md` for what the frontend calls. Code: `app/assistant/` (the agent), `app/services/gemini.py` (our Gemini wrapper), `app/routes/assistant.py` + `app/routes/consents.py`.

Try it in the terminal (server running in another tab):

```bash
python -m scripts.seed_demo --offline   # demo student with synthetic bank data, a budget and a goal
python -m scripts.chat_cli              # chat as that student; /consents, /revoke <scope>, /clear, /quit
```

Drop `--offline` to pull bank data from the Nessie sandbox instead. Use `python -m scripts.chat_cli --guest` to chat without an account.

If Gemini says the model is busy, requests automatically fall back to `GEMINI_FALLBACK_MODEL`. You can also set `GEMINI_MODEL` in `.env` to switch models.

## Tests

```bash
pytest
```

Runs offline: Gemini, ElevenLabs and Nessie are replaced with fakes, and each test uses a throwaway database.
