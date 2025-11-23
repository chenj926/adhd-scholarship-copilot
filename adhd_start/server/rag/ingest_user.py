# adhd_start/extension/rag/ingest_user.py

from pathlib import Path

# Prefer new langchain packages if installed; fall back to community.
try:
    from langchain_chroma import Chroma
except ImportError:  # noqa: E722
    from langchain_community.vectorstores import Chroma

try:
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:  # noqa: E722
    from langchain_community.embeddings import HuggingFaceEmbeddings

from langchain_text_splitters import RecursiveCharacterTextSplitter

EMB = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# .../adhd_start
BASE_DIR = Path(__file__).resolve().parents[2]
BASE = BASE_DIR / "server" / "store" / "chroma_user"


def upsert_user_text(user_id: str, text: str, tag: str = "note") -> int:
    db_dir = BASE / user_id
    db_dir.mkdir(parents=True, exist_ok=True)

    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)
    chunks = splitter.split_text(text)

    # IMPORTANT: metadata key should be "user_id", not the actual user id
    metas = [{"user_id": user_id, "tag": tag} for _ in chunks]

    vs = Chroma(persist_directory=str(db_dir), embedding_function=EMB)
    vs.add_texts(chunks, metadatas=metas)
    
    # FIX: Removed vs.persist() as it is deprecated/removed in newer Chroma versions (auto-persists)
    
    return len(chunks)