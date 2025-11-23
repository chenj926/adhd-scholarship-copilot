# adhd_start/extension/rag/ingest_global.py

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

# .../adhd_start
BASE_DIR = Path(__file__).resolve().parents[2]
DOC_DIR = BASE_DIR / "server" / "store" / "sample_pages"
DB_DIR = BASE_DIR / "server" / "store" / "chroma_global"

EMB = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")


def load_docs():
    docs = []
    for path in DOC_DIR.glob("*.txt"):
        with open(path, "r", encoding="utf-8") as file:
            docs.append({"source": path.name, "text": file.read()})
    return docs


if __name__ == "__main__":
    DB_DIR.mkdir(parents=True, exist_ok=True)

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=180)
    texts, metas = [], []

    for doc in load_docs():
        for chunk in splitter.split_text(doc["text"]):
            texts.append(chunk)
            metas.append({"source": doc["source"]})

    Chroma.from_texts(
        texts=texts,
        embedding=EMB,
        persist_directory=str(DB_DIR),
        metadatas=metas,
    )
    print(f"✅ Ingested {len(texts)} chunks into {DB_DIR}")
