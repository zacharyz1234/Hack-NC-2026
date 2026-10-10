from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.assistant.sessions import purge_expired
from app.config import CORS_ORIGIN_REGEX
from app.db import init_db
from app.routes import assistant, auth, budgets, categories, consents, expenses, health, nessie, savings_goals

app = FastAPI(title="Hack-NC-2026")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(budgets.router)
app.include_router(savings_goals.router)
app.include_router(expenses.router)
app.include_router(nessie.router)
app.include_router(assistant.router)
app.include_router(consents.router)


@app.on_event("startup")
def startup():
    init_db()
    purge_expired()
