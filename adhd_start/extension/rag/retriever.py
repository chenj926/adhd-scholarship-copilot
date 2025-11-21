# adhd_start/extension/rag/retriever.py
# ---------------------------------------------------------
# RAG helper: retrieve relevant chunks from:
#   - global DB: sample_pages → chroma_global
#   - user DB: per-user notes → chroma_user/<user_id>
#
# This module DOES NOT call Anthropic. It only:
#   - returns a text context (for prompts)
#   - returns a list of sources (for UI & feedback)
#
# Used by server.llm.extract_fields_rag_or_llm:
#   from extension.rag.retriever import get_context_for_parse
# ---------------------------------------------------------

from pathlib import Path
from typing import Tuple, List, Dict, Any

from server.user_repo import get_user

# Prefer new langchain packages if available; fall back to community
try:
    from langchain_chroma import Chroma
except ImportError:  # pragma: no cover
    from langchain_community.vectorstores import Chroma  # type: ignore

try:
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:  # pragma: no cover
    from langchain_community.embeddings import HuggingFaceEmbeddings  # type: ignore


# Shared embedding model (same one used for ingest)
EMB = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# .../adhd_start
BASE_DIR = Path(__file__).resolve().parents[2]

# Global DB: sample pages, e.g. sample_national_scholarship.txt
GLOBAL_DB = BASE_DIR / "server" / "store" / "chroma_global"

# Per-user DB: notes, prior applications, etc.
USER_DB_BASE = BASE_DIR / "server" / "store" / "chroma_user"


def _get_global_retriever(k: int = 5):
    """
    Returns a VectorStoreRetriever over the global Chroma DB.
    """
    vs = Chroma(persist_directory=str(GLOBAL_DB), embedding_function=EMB)
    return vs.as_retriever(search_kwargs={"k": k})


def _get_user_retriever(user_id: str, k: int = 5):
    """
    Returns a VectorStoreRetriever over the user-specific Chroma DB,
    e.g. server/store/chroma_user/<user_id>
    """
    user_dir = USER_DB_BASE / user_id
    vs = Chroma(persist_directory=str(user_dir), embedding_function=EMB)
    return vs.as_retriever(search_kwargs={"k": k})


def _score_docs(
    docs,
    user_id: str,
    user_profile: Dict[str, Any],
):
    """
    Score docs using:
      - base similarity score (if present)
      - per-source penalties from user weights
      - small bonus for user-specific docs (metadata.user_id == user_id)
    """
    penalties = user_profile.get("weights", {}).get("source_penalty", {})

    def score(doc):
        base = getattr(doc, "score", 0.0) if hasattr(doc, "score") else 0.0
        src = (doc.metadata or {}).get("source", "")
        weight = penalties.get(src, 1.0)
        bonus = 0.2 if (doc.metadata or {}).get("user_id") == user_id else 0.0
        return base * weight + bonus

    return sorted(docs, key=score, reverse=True)


def get_context_for_parse(
    page_text: str,
    user_id: str,
    k_global: int = 4,
    k_user: int = 4,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Build a RAG context for the /parse endpoint.

    Args:
        page_text: Raw text from the current page (not strictly needed for retrieval,
                   but you could use it later to refine the query).
        user_id:   ID of the current user ("demo-user" in smoke tests).
        k_global:  Number of chunks to retrieve from global DB.
        k_user:    Number of chunks to retrieve from user DB.

    Returns:
        context_str: concatenated text of retrieved chunks
        sources:     list of { "source": str, "snippet": str }
                     for UI display and feedback logging.
    """
    # Broad query to cover deadlines, references, values, and AI policy language.
    # You can later augment this with keywords extracted from page_text.
    query = "deadline reference referee values policy apply requirements scholarship job"

    # 1) Retrieve from global and user stores
    try:
        global_docs = _get_global_retriever(k_global).invoke(query)
    except Exception as e:
        print("[retriever] Global retrieval failed:", repr(e))
        global_docs = []

    try:
        user_docs = _get_user_retriever(user_id, k_user).invoke(query)
    except Exception as e:
        # It's fine if user DB doesn't exist yet (no user notes)
        print("[retriever] User retrieval failed:", repr(e))
        user_docs = []

    docs = global_docs + user_docs
    if not docs:
        # No RAG context available → caller will still use page_text alone.
        return "", []

    # 2) Score + rank using user weights (if any)
    profile = get_user(user_id)
    ranked = _score_docs(docs, user_id, profile)

    # 3) Take top N chunks
    top_n = max(1, min(len(ranked), k_global + k_user))
    top = ranked[:top_n]

    context = "\n\n---\n\n".join(d.page_content for d in top)

    sources: List[Dict[str, Any]] = [
        {
            "source": (d.metadata or {}).get("source", ""),
            "snippet": d.page_content[:240],
        }
        for d in top
    ]

    return context, sources
