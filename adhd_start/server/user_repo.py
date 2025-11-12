import json, os, pathlib

BASE = pathlib.Path("server.store")
USER_DIR = BASE / "user_data"
USER_DIR.mkdir(parents=True, exist_ok=True)

def user_path(user_id: str) -> pathlib.Path:
    return USER_DIR / f"{user_id}.json"

DEFAULT_USER = {
    "user_id": "demo-user",
    "demographics": {"timezone": "America/Toronto"},
    "program": "UofT Industrial Engineering",
    "interests": ["AI/ML"],
    "preferences": {
        "tone": "warm_direct",
        "block_minutes": 20,
        "checkins": ["T+5","T+12"],
        "coach_only_on_restricted": True
    },
    "history": {"apps": [], "wins": [], "frictions": []},
    "weights": {"source_penalty": {}, "nudge_success": {}}
}

def get_user(user_id: str):
    user_path = user_path(user_id)
    if not user_path.exists():
        save_user(DEFAULT_USER | {"user_id": user_id})

    with open(user_path, "r", encoding="utf-8") as file: json.load(file)

def save_user(data: dict):
    user_path = user_path(data["user_id"])
    with open(user_path, "w", encoding="utf-8") as file: json.dump(data, file, ensure_ascii=False, indent=2)

def update_preferences(user_id:str, **kwargs):
    u = get_user(user_id)
    u["preferences"].update({k:v for k,v in kwargs.items() if v is not None})
    save_user(u); return u

def append_history(user_id:str, key:str, value):
    u = get_user(user_id)
    u["history"].setdefault(key, [])
    u["history"][key].append(value)
    save_user(u); return u

def update_weight(user_id:str, table:str, key:str, factor:float):
    u = get_user(user_id)
    u["weights"].setdefault(table, {})
    u["weights"][table][key] = u["weights"][table].get(key, 1.0) * factor
    save_user(u); return u
