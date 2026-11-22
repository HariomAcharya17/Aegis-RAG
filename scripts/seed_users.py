"""
Create (or reset) the five demo accounts and give each its role.

Usage:
    python scripts/seed_users.py

Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_PASSWORD.
Uses only the Python standard library.

Roles are written with the service key. The signup trigger always creates
profiles as 'employee', so this script (or SQL) is the only way to grant
a higher role.
"""
import json
import urllib.error
import urllib.request

from _env import load_env, need

USERS = [
    ("employee@kestrel.example.com", "Sam Rivera", "employee"),
    ("finance@kestrel.example.com", "Priya Nair", "finance"),
    ("hr@kestrel.example.com", "Jordan Lee", "hr"),
    ("marketing@kestrel.example.com", "Mateo Cruz", "marketing"),
    ("executive@kestrel.example.com", "Elena Park", "executive"),
]


def request(method: str, url: str, key: str, body=None):
    headers = {"apikey": key, "content-type": "application/json"}
    # Legacy service_role keys are JWTs and also go in Authorization.
    # New sb_secret_ keys are sent only as apikey.
    if key.startswith("eyJ"):
        headers["authorization"] = f"Bearer {key}"
    if method == "PATCH":
        headers["prefer"] = "return=minimal"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read()
            return res.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode(errors="replace")


def find_user_id(base: str, key: str, email: str):
    for page in range(1, 20):
        status, body = request("GET", f"{base}/auth/v1/admin/users?page={page}&per_page=200", key)
        if status != 200:
            raise SystemExit(f"Listing users failed: {status} {body}")
        users = body.get("users", []) if isinstance(body, dict) else []
        for u in users:
            if (u.get("email") or "").lower() == email:
                return u["id"]
        if len(users) < 200:
            return None
    return None


def main() -> None:
    load_env()
    base = need("NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
    key = need("SUPABASE_SERVICE_ROLE_KEY")
    password = need("DEMO_PASSWORD")
    if len(password) < 12:
        raise SystemExit("DEMO_PASSWORD should be at least 12 characters.")

    for email, name, role in USERS:
        status, body = request("POST", f"{base}/auth/v1/admin/users", key,
                               {"email": email, "password": password, "email_confirm": True})
        if status in (200, 201):
            user_id = body["id"]
            action = "created"
        else:
            user_id = find_user_id(base, key, email)
            if not user_id:
                raise SystemExit(f"Could not create or find {email}: {status} {body}")
            status, body = request("PUT", f"{base}/auth/v1/admin/users/{user_id}", key, {"password": password})
            if status != 200:
                raise SystemExit(f"Could not reset password for {email}: {status} {body}")
            action = "updated"

        status, body = request("PATCH", f"{base}/rest/v1/profiles?id=eq.{user_id}", key,
                               {"role": role, "full_name": name, "email": email})
        if status not in (200, 204):
            raise SystemExit(f"Could not set role for {email}: {status} {body}. Did you run supabase/schema.sql?")
        print(f"  {action:8s} {email:34s} role={role}")

    print("\nDone. Sign in with any of these emails and DEMO_PASSWORD.")


if __name__ == "__main__":
    main()
