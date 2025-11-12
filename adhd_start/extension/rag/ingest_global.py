import os, glob
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters  import RecursiveCharacterTextSplitter

DOC_DIR = "adhd_start/server/store/sample_pages"
DB_DIR = "adhd_start/server/store/chroma_global"
EMB = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

def load_docs():
    # empty list to hold all docs
    docs = []

    for path in glob.glob(f"{DOC_DIR}/*.txt"):
        with open(path, "r", encoding="utf-8") as file:
            docs.append({"source": os.path.basename(path), "text": file.read()})

    return docs

if __name__ == "__main__":
    os.makedirs(DB_DIR, exist_ok=True)
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, 
                                              chunk_overlap=180)
    texts, metas = [], []
    for doc in load_docs():
        for chunk in splitter.split_text(doc["text"]):
            texts.append(chunk)
            metas.append({"source": doc["source"]})
    Chroma.from_texts(texts=texts, embedding=EMB, persist_directory=DB_DIR, metadatas=metas)
    print(f"✅ Ingested {len(texts)} chunks into {DB_DIR}")