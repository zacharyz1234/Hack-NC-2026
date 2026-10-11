"""Numeric display hints from public stock tool results, never model-generated markup."""
import math


def numbers_for_turn(transcript: list[dict]) -> list[dict]:
    hints = []
    for entry in reversed(transcript):
        if entry["kind"] == "user":
            break
        if entry["kind"] != "tool":
            continue
        for part in entry["content"].get("parts", []):
            response = part.get("function_response", {})
            result = response.get("response", {})
            if result.get("status") != "ok":
                continue
            name = response.get("name")
            if name == "get_stock_price_comparison":
                direction = result["direction"]
                values = [(result["start"]["price"], "price"), (result["end"]["price"], "price"),
                          (result["change_amount"], "price"), (result["change_percent"], "percent")]
            elif name == "get_stock_quote":
                change = result.get("change_percent")
                if change is None:
                    change = result.get("change_amount")
                direction = "increased" if change is not None and change > 0 else (
                    "decreased" if change is not None and change < 0 else "unchanged")
                values = [(result.get(key), unit) for key, unit in (
                    ("price", "price"), ("previous_close", "price"),
                    ("change_amount", "price"), ("change_percent", "percent"))]
            else:
                continue
            for value, unit in values:
                if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
                    hint = {"value": value, "unit": unit, "direction": direction}
                    if hint not in hints:
                        hints.append(hint)
    return hints
