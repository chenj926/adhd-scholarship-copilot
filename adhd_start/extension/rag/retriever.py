from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from server.user_repo import get_user
from anthropic import Anthropic
from anthropic import Anthropic
import json, re
from dateutil import parser as dateparser

EMB = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
GLOBAL_DB = "adhd_start/server/store/chroma_global"
USER_DB_BASE = "adhd_start/server/store/chroma_user"

"""
Merges global and user memory; lightly biases toward user-relevant chunks.
"""

EXTRACT_SCHEMA = """
Return ONLY valid JSON:
{
  "deadline": string|null,           // YYYY-MM-DD if possible; else null
  "refs_required": number|null,      // 0,1,2...
  "values": string[],                // e.g., ["creativity","leadership"]
  "ai_policy": "ok"|"coach_only"     // coach_only if text forbids AI-authored content
}
"""

EXTRACT_PROMPT = """
You extract fields from CONTEXT. If uncertain, use null or empty list. No extra words.

CONTEXT:
{context}

{schema}
"""

def get_global_retriever(k: int = 5):
    vs = Chroma(persist_directory=GLOBAL_DB, embedding_function=EMB)
    
    return vs.as_retriever(search_kwargs={"k": k})

def get_user_retriever(userid: str, k: int = 5):
    vs = Chroma(persist_directory=f"{USER_DB_BASE}/{userid}", embedding_function=EMB)

    return vs.as_retriever(search_kwargs={"k": k})

def fused_retrieve(query: str, user_id: str, k_global: int = 4, k_user: int = 4):
    g = get_global_retriever(k_global).get_relevant_documents(query)
    
    try:
        user = get_user_retriever(user_id, k_user)._get_relevant_documents(query)
    except Exception:
        user = []

    user = get_user(user_id)
    penalties = user["weights"].get("source_penalty", {})

    def score(doc):
        score = getattr(doc, "score", 0.0) if hasattr(doc, "score") else 0.0
        src = (doc.metadata or {}).get("source", "")
        weight = penalties.get(src, 1.0)
        bouns = 0.2 if (doc.metadata or {}).get("user_id") == user_id else 0.0

        return score * weight + bouns

    docs = g + user
    docs.sort(key=score, reverse=True)
    top = docs[: max(1, min(len(docs), k_global+k_user))]
    context = "\n\n---\n\n".join(d.page_content for d in top)
    sources = [{"source": (d.metadata or {}).get("source",""), "snippet": d.page_content[:240]} for d in top]
    return context, sources

def extract_fields_with_llm(client:Anthropic, user_id:str, page_text:str):
    # Broad query; you could add keywords here if you want
    query = "deadline reference referee values policy apply requirements scholarship job"
    context, sources = fused_retrieve(query, user_id, k_global=4, k_user=4)
    system = "Return JSON only. No extra text."
    user_msg = EXTRACT_PROMPT.format(context=page_text[:4000] + "\n\n" + context, schema=EXTRACT_SCHEMA)
    msg = client.messages.create(
        model="claude-3.5-sonnet-latest",
        system=system,
        max_tokens=400,
        messages=[{"role":"user","content": user_msg}]
    )
    try:
        data = json.loads(msg.content[0].text)
    except Exception:
        data = {"deadline": None, "refs_required": None, "values": [], "ai_policy": "ok"}

    data["deadline"] = normalize_date(data.get("deadline"))
    # sanity check
    if data.get("ai_policy") not in ("ok","coach_only"):
        data["ai_policy"] = detect_ai_policy(page_text, context)
    return data, sources

def normalize_date(s: str|None):
    if not s: return None
    try:
        dt = dateparser.parse(s, fuzzy=True)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None

FORBID_PATTERNS = [
    r"no\s+ai[-\s]?generated\s+content",
    r"must\s+be\s+your\s+own\s+work",
    r"generative\s+ai\s+not\s+permitted",
    r"plagiarism|original work only"
]

def detect_ai_policy(raw_text:str, context:str) -> str:
    hay = f"{raw_text}\n{context}".lower()
    return "coach_only" if any(re.search(p, hay) for p in FORBID_PATTERNS) else "ok"

def suggest_selector_hint(page_text:str)->tuple[str, str]:
    t = page_text.lower()
    if "apply now" in t or "apply" in t: 
        return ("click_selector", "apply|apply now|submit application")
    if "cover letter" in t or "summary" in t or "why us" in t:
        return ("focus_input", "textarea|input|editor")
    return ("make_outline", "")
