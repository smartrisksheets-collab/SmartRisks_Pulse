"""
One-time script to create the first super_admin account.
Run once on staging, verify, then run on prod.

Usage:
    python seed_admin.py
"""
import asyncio
import getpass
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.admin_account import AdminAccount


async def seed() -> None:
    print("SmartRisk Admin Seed")
    print("--------------------")
    print("Enter details for each super admin. Type 'done' as email when finished.\n")

    entries: list[dict] = []

    while True:
        email = input("Email (or 'done' to finish): ").strip().lower()
        if email == "done":
            break

        name = input("Name: ").strip()
        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Confirm password: ")

        if password != confirm:
            print("Passwords do not match. Skipping this entry.\n")
            continue

        if len(password) < 12:
            print("Password must be at least 12 characters. Skipping this entry.\n")
            continue

        entries.append({"email": email, "name": name, "password": password})
        print(f"Queued: {name} <{email}>\n")

    if not entries:
        print("No entries queued. Aborting.")
        sys.exit(1)

    async with AsyncSessionLocal() as db:
        created: list[str] = []
        skipped: list[str] = []

        for entry in entries:
            existing = await db.execute(
                select(AdminAccount).where(AdminAccount.email == entry["email"])
            )
            if existing.scalar_one_or_none():
                skipped.append(entry["email"])
                continue

            db.add(AdminAccount(
                email=entry["email"],
                name=entry["name"],
                password_hash=hash_password(entry["password"]),
                role="super_admin",
                status="ACTIVE",
            ))
            created.append(entry["email"])

        await db.commit()

    print("\n---- Seed complete ----")
    for email in created:
        print(f"  created : {email}")
    for email in skipped:
        print(f"  skipped (already exists): {email}")
    print("\nAll done. Log in at admin.smartrisksheets.com")


if __name__ == "__main__":
    asyncio.run(seed())