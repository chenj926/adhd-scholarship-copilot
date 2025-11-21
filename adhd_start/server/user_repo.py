import json
from pathlib import Path
import hashlib
from datetime import datetime, timezone

# Base directory: .../adhd_start/server
BASE_DIR = Path(__file__).resolve().parent

# Store everything under .../adhd_start/server/store
STORE_DIR = BASE_DIR / "store"
USER_DIR = STORE_DIR / "user_data"
USER_DIR.mkdir(parents=True, exist_ok=True)


def user_path(user_id: str) -> Path:
    """Return the JSON path for this user."""
    return USER_DIR / f"{user_id}.json"


DEFAULT_USER = {
    "user_id": "demo-user",
    "demographics": {"timezone": "America/Toronto"},
    "program": "UofT Industrial Engineering",
    "interests": ["AI/ML"],
    "preferences": {
        "tone": "warm_direct",
        "block_minutes": 20,
        "checkins": ["T+5", "T+12"],
        "coach_only_on_restricted": True,
    },
    "history": {"apps": [], "wins": [], "frictions": []},
    "weights": {"source_penalty": {}, "nudge_success": {}},
}


def get_user(user_id: str):
    """Load user profile from disk, creating a default one if missing."""
    path = user_path(user_id)
    if not path.exists():
        save_user({**DEFAULT_USER, "user_id": user_id})

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_user(data: dict):
    """Persist the user profile to disk."""
    path = user_path(data["user_id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def update_preferences(user_id: str, **kwargs):
    u = get_user(user_id)
    u["preferences"].update({k: v for k, v in kwargs.items() if v is not None})
    save_user(u)
    return u


def append_history(user_id: str, key: str, value):
    u = get_user(user_id)
    u["history"].setdefault(key, [])
    u["history"][key].append(value)
    save_user(u)
    return u


def update_weight(user_id: str, table: str, key: str, factor: float):
    u = get_user(user_id)
    u["weights"].setdefault(table, {})
    u["weights"][table][key] = u["weights"][table].get(key, 1.0) * factor
    save_user(u)
    return u


# for bookmark stuff

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _mk_bookmark_id(url: str, ts: str) -> str:
    h = hashlib.sha1((url + "|" + ts).encode("utf-8")).hexdigest()[:12]
    return f"bm_{h}"

def list_bookmarks(user_id: str):
    u = get_user(user_id)
    return u.get("history", {}).get("apps", [])

def upsert_bookmark(
    user_id: str,
    url: str,
    title: str | None = None,
    source_site: str | None = None,
    deadline: str | None = None,
    tags: list[str] | None = None,
):
    u = get_user(user_id)
    apps = u.setdefault("history", {}).setdefault("apps", [])
    tags = tags or []

    # update existing by URL (simple de-dupe)
    for b in apps:
        if b.get("url") == url:
            b["title"] = title or b.get("title")
            b["source_site"] = source_site or b.get("source_site")
            b["deadline"] = deadline or b.get("deadline")
            b["tags"] = sorted(set((b.get("tags") or []) + tags))
            b["updated_at"] = _now_iso()
            save_user(u)
            return b

    # create new
    created_at = _now_iso()
    bid = _mk_bookmark_id(url, created_at)
    new_bm = {
        "id": bid,
        "url": url,
        "title": title,
        "source_site": source_site,
        "status": "saved",
        "deadline": deadline,
        "tags": tags,
        "created_at": created_at,
        "updated_at": created_at,
    }
    apps.append(new_bm)
    save_user(u)
    return new_bm

def set_bookmark_status(user_id: str, bookmark_id: str, status: str):
    u = get_user(user_id)
    apps = u.setdefault("history", {}).setdefault("apps", [])
    for b in apps:
        if b.get("id") == bookmark_id:
            b["status"] = status
            b["updated_at"] = _now_iso()
            save_user(u)
            return b
    raise ValueError("bookmark_not_found")
