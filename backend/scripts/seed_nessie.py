"""Seed the Nessie sandbox with a customer, two accounts, merchants and purchases.

Run from backend/:  python -m scripts.seed_nessie
To also link the customer to an app account and copy the data in, use scripts.seed_demo instead.
"""
from app.services.nessie import NessieError, create_demo_customer


def main() -> None:
    try:
        customer_id = create_demo_customer()
    except NessieError as exc:
        raise SystemExit(str(exc)) from None
    print("customer", customer_id)
    print("seeded 2 accounts, 20 purchases and 1 deposit")


if __name__ == "__main__":
    main()
