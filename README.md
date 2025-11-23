# ADHD Scholarship Copilot

**ADHD Scholarship Copilot** is a Chrome Extension and FastAPI backend designed to help neurodivergent students overcome the "Wall of Awful" associated with scholarship and job applications.

It uses AI to break tasks down into micro-steps, utilizes RAG (Retrieval-Augmented Generation) to parse complex requirements, and includes gamified focus tools to keep users on track.

## ✨ Key Features

### 🧠 AI & RAG Powered

  - **Micro-Starts:** Uses **Claude 4.5 Sonnet** to break a daunting webpage into a 4-step actionable plan (Read -\> Check -\> Focus -\> Feedback).
  - **RAG Extraction:** Vector search (ChromaDB) retrieves relevant context to accurately parse deadlines, reference requirements, and AI policies from scholarship pages.
  - **Firecrawl Integration:** Scrapes and cleans scholarship pages for the backend library.

### 🛡️ Focus Tools

  - **Focus Shield:** A visual spotlight (Circle/Rectangle) that dims the rest of the screen to reduce visual clutter.
  - **Focus Games:**
      - *Keyword Sniper:* Gamified reading where you click keywords to gain XP.
      - *Visual Search:* A quick pattern-matching game to reset dopamine during breaks.
      - *Focus Chain:* Tracks consecutive actions without tab-switching.
  - **Session Timer:** Configurable focus blocks with periodic "check-ins" (e.g., T+5, T+12 minutes).

### 👤 Profile & Autofill

  - **Local Profile:** Securely stores personal info, education details, and reference contacts in Chrome Storage.
  - **Smart Autofill:** Automatically fills common application fields (names, addresses, citizenship radios) based on the user profile.
  - **Eligibility Check:** Compares the scholarship text against the user profile to warn about mismatching degrees or citizenship requirements.

-----

## 🛠️ Tech Stack

  - **Backend:** Python 3.10+, FastAPI, Uvicorn
  - **AI/LLM:** Anthropic (Claude 4.5 Sonnet), LangChain, HuggingFace Embeddings
  - **Database:** ChromaDB (Vector Store), JSONL (Feedback/Logs)
  - **Scraping:** Firecrawl
  - **Frontend:** Chrome Extension (HTML/CSS/JS/TypeScript)

-----

## 🚀 Getting Started

### 1\. Prerequisites

  - Python 3.10 or higher
  - Google Chrome (for the extension)
  - An [Anthropic API Key](https://console.anthropic.com/)
  - A [Firecrawl API Key](https://firecrawl.dev/)

### 2\. Backend Setup

1.  Navigate to the project root:

    ```bash
    cd adhd_start
    ```

2.  Create a virtual environment (optional but recommended):

    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

3.  Install dependencies:

    ```bash
    pip install -r server/requirements.txt
    ```

4.  **Configure Environment Variables:**
    Create a `.env` file in the `adhd_start` directory (or `adhd_start/server/`). Add the following keys:

    ```ini
    # .env
    ANTHROPIC_API_KEY=sk-ant-api03-...
    # The specific model version used in this build
    ANTHROPIC_MODEL=claude-sonnet-4-5-20250929

    FIRECRAWL_API_KEY=fc-YOUR_KEY_HERE
    ```

### 3\. Data Ingestion (Optional)

To make the RAG (Retrieval-Augmented Generation) and Scholarship Library work effectively, you need to ingest data.

  * **Ingest Sample Pages (RAG Context):**
    ```bash
    # Runs adhd_start/extension/rag/ingest_global.py
    python -m extension.rag.ingest_global
    ```
  * **Scrape & Update Library (Firecrawl):**
    ```bash
    # Runs adhd_start/server/tools/firecrawl_ingest.py
    # Scrapes URLs from server/store/public_scholarship_urls.txt
    python -m server.tools.firecrawl_ingest
    ```

### 4\. Run the Server

Start the FastAPI backend. Keep this terminal open.

```bash
# Must be run from the 'adhd_start' directory
python -m uvicorn server.app:app --reload --port 8000
```

Verify it is running by visiting: [http://127.0.0.1:8000/docs](https://www.google.com/search?q=http://127.0.0.1:8000/docs)

-----

### 5\. Load the Chrome Extension

1.  Open Chrome and navigate to `chrome://extensions`.
2.  Enable **Developer mode** (top right toggle).
3.  Click **Load unpacked**.
4.  Select the `adhd_start/extension` folder.
5.  Pin the "Rocket" icon to your toolbar.

-----

## 📖 Usage Guide

1.  **Micro-Start:**

      * Navigate to any scholarship or job posting.
      * Open the extension popup.
      * Click **"✨ AI Micro-Start"**.
      * Claude will read the page and generate a 4-step overlay to get you moving.

2.  **Focus Mode:**

      * In the popup, set minutes (e.g., 20) and check-ins (e.g., 5, 12).
      * Click **"🚀 START FOCUS MODE"**.
      * Use the "Spotlight" controls to dim distractions.

3.  **Library & Search:**

      * In the popup, click **"📚 Library"**.
      * Click **"Load Scholarships"** to fetch data scraped by Firecrawl.

4.  **Profile & Autofill:**

      * Click **"👤 Profile"** to open the side-panel/window.
      * Fill in your details and save.
      * On an application page, click **"✍️ Autofill"** in the popup to auto-complete fields.

-----

## 📂 Project Structure

```text
adhd_start/
├── .env                        # API Keys (Anthropic, Firecrawl)
├── dev_smoke.sh                # Smoke test script for backend
│
├── server/                     # FASTAPI BACKEND
│   ├── app.py                  # Main entry point & Routes
│   ├── llm.py                  # Anthropic & RAG Logic
│   ├── firecrawl_client.py     # Firecrawl API wrapper
│   ├── schemas.py              # Pydantic models
│   ├── tools/
│   │   └── firecrawl_ingest.py # Script to scrape URLs -> JSON
│   └── store/                  # Local DBs
│       ├── chroma_global/      # Vector store for RAG
│       ├── scholarships.json   # Scraped library data
│       └── user_data/          # User profiles (JSON)
│
└── extension/                  # CHROME EXTENSION
    ├── manifest.json           # MV3 Manifest
    ├── popup.html / .js        # Main extension UI
    ├── profile.html / .js      # User profile form
    ├── micro_start_overlay.js  # The 4-step AI plan overlay
    ├── focus_games.js          # Spotlight & Visual Search games
    ├── dist/                   # Compiled TS helpers
    └── rag/                    # RAG ingestion scripts (shared logic)
        ├── ingest_global.py
        └── retriever.py
```

## ⚠️ Notes

  * **API Costs:** This project uses the Anthropic API and Firecrawl API. Usage will incur costs on your respective accounts.
  * **Privacy:** Profile data is stored locally in your browser (`chrome.storage`). Backend logging (feedback) is stored in local JSONL files.
  * **Smoke Test:** You can run `./dev_smoke.sh` to quickly test if the backend endpoints (`/parse`, `/plan`) are responding correctly.