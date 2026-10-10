"""Chat with Gill Gates in the terminal through the real HTTP API (the same calls the frontend makes).

Start the server first (uvicorn app.main:app --reload), then from backend/:
    python -m scripts.chat_cli                      # logs in as the seed_demo student
    python -m scripts.chat_cli --email you@unc.edu --password ...
    python -m scripts.chat_cli --guest

Commands while chatting: /consents  /revoke <scope>  /clear  /quit
"""
import argparse

import httpx

from scripts.seed_demo import DEMO_PASSWORD

CHOICES = {"o": "once", "c": "chat", "a": "always", "n": "deny"}


class Chat:
    def __init__(self, api: httpx.Client):
        self.api = api
        self.session_id = ""

    def start(self) -> None:
        session = self.api.post("/assistant/sessions").json()
        self.session_id = session["session_id"]
        print(f"\n(chat {self.session_id}, signed in: {session['signed_in']})")
        print("Try: " + " | ".join(session["suggestions"]))
        self.render(session)

    def post(self, path: str, body: dict) -> dict | None:
        response = self.api.post(f"/assistant/sessions/{self.session_id}{path}", json=body)
        if response.is_error:
            print(f"   ! {response.status_code}: {response.json().get('detail')}")
            return None
        return response.json() if response.content else {}

    def render(self, turn: dict | None) -> None:
        while turn:
            follow_up = None
            for event in turn["events"]:
                kind = event["type"]
                if kind == "message":
                    print(f"\n🐟 Gill: {event['text']}")
                elif kind == "notice":
                    print(f"\n   ⓘ {event['text']}")
                elif kind == "data_access":
                    print(f"   [{event['label']}]")
                elif kind == "component":
                    follow_up = self.component(event) or follow_up
                elif kind == "consent_request":
                    follow_up = self.consent(event) or follow_up
            turn = follow_up

    # ----- cards -----

    def component(self, event: dict) -> dict | None:
        name, props = event["component"], event["props"]
        if name == "budget_slider":
            print(f"\n   [slider] {props['label']}  (${props['min']}-${props['max']}, step {props['step']})")
            return self.ask(event, lambda raw: {"amount": float(raw or props["default"])}, f"amount [{props['default']}]")
        if name == "category_picker":
            print(f"\n   [categories] {props['label']}  (pick up to {props['max_choices']})")
            for i, option in enumerate(props["options"], 1):
                print(f"     {i:2}. {option['name']}")
            options = props["options"]
            return self.ask(event, lambda raw: {"category_ids": [options[int(n) - 1]["id"] for n in raw.split(",")]}, "numbers, comma-separated")
        if name == "amount_form":
            print(f"\n   [form] {props['label']} ({props['period'].replace('_', ' ')})")
            values = {}
            for field in props["fields"]:
                raw = input(f"     {field['label']} $ ").strip()
                if raw:
                    values[field["key"]] = float(raw)
            return self.post("/submit", {"call_id": event["call_id"], "value": {"values": values}} if values else {"call_id": event["call_id"], "dismissed": True})
        if name == "budget_plan":
            print(f"\n   [budget plan] {props['month_label']}  {props['note']}")
            for row in props["rows"]:
                print(f"     {row['category']:<16} ${row['amount']:>9,.2f}")
            print(f"     {'allocated':<16} ${props['allocated']:>9,.2f}" + (f"   left unassigned ${props['unallocated']:,.2f}" if props["unallocated"] is not None else ""))
            if props["can_save"] and self.yes("Save this budget?"):
                limits = [{"category_id": r["category_id"], "limit_cents": round(r["amount"] * 100)} for r in props["rows"]]
                self.save(f"/budgets/{props['month']}", "put", {"limits": limits}, "budget")
            return None
        if name == "savings_calculator":
            print(f"\n   [savings] {props['goal_name']}: ${props['remaining']:,.2f} to go of ${props['target']:,.2f}")
            if props["months_needed"] is not None:
                print(f"     ${props['monthly_contribution']:,.2f}/month -> {props['months_needed']} months (done {props['projected_completion']})")
            if props["required_monthly_for_target_date"] is not None:
                print(f"     to hit {props['target_date']}: ${props['required_monthly_for_target_date']:,.2f}/month")
            if props["can_save"] and self.yes("Create this goal?"):
                body = {"name": props["goal_name"], "target_cents": round(props["target"] * 100),
                        "saved_cents": round(props["already_saved"] * 100), "target_date": props["target_date"]}
                self.save("/savings-goals", "post", body, "savings_goal")
            return None
        if name == "expense_draft":
            print(f"\n   [expense] ${props['amount']:,.2f}  {props['description']}  ({props['category'] or 'no category'}, {props['date']})")
            if props["can_save"] and self.yes("Add this expense?"):
                body = {"amount_cents": round(props["amount"] * 100), "description": props["description"],
                        "category_id": props["category_id"], "spent_on": props["date"]}
                self.save("/expenses", "post", body, "expense")
            return None
        if name == "scenario_comparison":
            names = [s["name"] for s in props["scenarios"]]
            print("\n   [compare] " + " | ".join(f"{n:>12}" for n in names))
            for row in props["rows"]:
                print(f"   {row['category']:<12}" + " | ".join(f"${a:>11,.2f}" for a in row["amounts"]))
            print(f"   {'total':<12}" + " | ".join(f"${s['total']:>11,.2f}" for s in props["scenarios"]))
            return None
        if name == "spending_chart":
            print(f"\n   [chart] {props['title']}  {props['period_label'] or ''}")
            top = max((p.get("limit") or p["value"] for p in props["series"]), default=1) or 1
            for point in props["series"]:
                limit = f" / ${point['limit']:,.2f}" if "limit" in point else ""
                print(f"     {point['label']:<14} {'█' * round(30 * point['value'] / top):<30} ${point['value']:,.2f}{limit}")
            return None
        print(f"   (unknown component {name}, ignored)")
        return None

    def ask(self, event: dict, parse, hint: str) -> dict | None:
        while True:
            raw = input(f"     {hint} (x = dismiss)> ").strip()
            if raw == "x":
                return self.post("/submit", {"call_id": event["call_id"], "dismissed": True})
            try:
                value = parse(raw)
            except (ValueError, IndexError):
                print("     couldn't read that, try again")
                continue
            turn = self.post("/submit", {"call_id": event["call_id"], "value": value})
            if turn is not None:
                return turn

    def consent(self, event: dict) -> dict | None:
        print("\n   ┌ Gill would like to look at:")
        decisions = {}
        for item in event["items"]:
            period = f"  · {item['period_label']}" if item["period_label"] else ""
            print(f"   │ {item['title']}{period}\n   │   {item['details']}")
            choice = ""
            while choice not in CHOICES:
                choice = input("   │   [o]nce / [c] this chat / [a]lways / [n]o thanks > ").strip().lower()[:1]
            decisions[item["scope"]] = CHOICES[choice]
        print(f"   │ {event['purpose']}\n   │ Shared with: {event['shared_with']}\n   └ {event['footer']}")
        return self.post("/consent", {"request_id": event["request_id"], "decisions": decisions})

    def save(self, path: str, method: str, body: dict, target: str) -> None:
        """What the frontend's Save button does: the normal app API, then tell the chat."""
        response = self.api.request(method.upper(), path, json=body)
        if response.is_error:
            print(f"   ! save failed {response.status_code}: {response.json().get('detail')}")
            return
        print("   ✓ saved (by you, through the app's API)")
        self.post("/events", {"type": "user_saved", "target": target})

    @staticmethod
    def yes(question: str) -> bool:
        return input(f"   {question} [y/N] ").strip().lower().startswith("y")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--email", default="demo@unc.edu")
    parser.add_argument("--password", default=DEMO_PASSWORD)
    parser.add_argument("--guest", action="store_true")
    args = parser.parse_args()

    with httpx.Client(base_url=args.base_url, timeout=120) as api:
        if not args.guest:
            login = api.post("/auth/login", json={"email": args.email, "password": args.password})
            if login.is_error:
                raise SystemExit(f"Login failed ({login.status_code}). Run python -m scripts.seed_demo first?")
            api.headers["Authorization"] = f"Bearer {login.json()['token']}"
        chat = Chat(api)
        chat.start()
        while True:
            try:
                text = input("\nyou> ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if not text:
                continue
            if text == "/quit":
                break
            if text == "/consents":
                for row in api.get("/consents").json()["consents"]:
                    print(f"   {row['scope']:<28} {row['status']}")
            elif text.startswith("/revoke "):
                response = api.delete(f"/consents/{text.split(maxsplit=1)[1]}")
                print("   turned off" if response.status_code == 204 else f"   ! {response.status_code}")
            elif text == "/clear":
                api.delete(f"/assistant/sessions/{chat.session_id}")
                chat.start()
            else:
                chat.render(chat.post("/messages", {"text": text}))


if __name__ == "__main__":
    main()
