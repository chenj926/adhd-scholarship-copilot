import os, pathlib
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

EMB = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
BASE = pathlib.Path("adhd_start/server/store/chroma_user")

def upsert_user_text(user_id: str, text: str, tag: str="note"):
    db_dir = BASE / user_id
    db_dir.mkdir(parents=True, exist_ok=True)
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)
    chunks = splitter.split_text(text)
    metas = [{user_id: user_id, "tag": tag} for _ in chunks]
    vs = Chroma(persist_directory=str(db_dir), embedding_function=EMB)
    vs.add_texts(chunks, metadatas=metas)
    vs.persist()
    
    return len(chunks)