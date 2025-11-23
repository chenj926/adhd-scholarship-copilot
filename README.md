# ADHD Scholarship Copilot

ADHD Scholarship Copilot is a Chrome extension + FastAPI backend that helps ADHD students in Canada actually start and finish scholarship applications.

It combines:
- Focus support (spotlight, timers, micro-starts, break games)
- Scholarship parsing (deadlines, values, requirements, AI policy)
- Profile-based eligibility checks
- Smart autofill for common form fields (name, email, address, degree, graduation date)

---

## Getting Started

### Prerequisites
- Python 3.10+
- Google Chrome
- FastAPI backend running locally
- API keys:
  - FRACTAL_API_KEY
  - ANTHROPIC_API_KEY (Claude 3.5)

---

## Project Structure

```text
adhdh-start/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   └── routers/
│   │       ├── plan.py
│   │       ├── parse.py
│   │       ├── bookmark.py
│   │       ├── eligibility.py
│   │       └── scholarships.py
│   ├── .env
│   └── requirements.txt
│
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── popup.ts
│   ├── profile.html
│   ├── profile.js
│   ├── focus_games.js
│   └── icons/
│
└── README.md
```

Backend → FastAPI endpoints (`/plan`, `/parse`, `/bookmark`, `/bookmarks`, `/eligibility`, `/scholarships`)  
Extension → Chrome extension UI (popup, spotlight, autofill, summary tools)

---

## Environment Variables

Inside `adhdh-start` create a file named `.env`:

FRACTAL_API_KEY=your_fractal_api_key_here  
ANTHROPIC_API_KEY=your_claude_api_key_here  

Never commit your `.env`.

---

## Install Dependencies

Inside the backend folder:

pip install -r requirements.txt

---

## Run the Backend

uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

Backend endpoints:
- http://127.0.0.1:8000/plan  
- http://127.0.0.1:8000/parse  
- http://127.0.0.1:8000/bookmark  
- http://127.0.0.1:8000/bookmarks?user_id=demo-user  
- http://127.0.0.1:8000/eligibility  
- http://127.0.0.1:8000/scholarships

---

## Load the Chrome Extension

1. Open Chrome → chrome://extensions  
2. Enable **Developer mode**  
3. Click **Load Unpacked**  
4. Select the `extension/` folder  

You will now see the extension icon in your toolbar.

---

## Devpost & Demo Links

- Devpost: *https://devpost.com/software/adhd-scholarship-copilot#updates*  
- Demo Video: *Add your demo video link here*

---

## Tech Stack

- Backend: FastAPI (Python)  
- Extension: Chrome extension (HTML/CSS/JS/TS)  
- LLM: Claude 3.5 Sonnet (via Fractal/Anthropic)  
- Storage: Chrome storage.sync  
- Autofill: Chrome scripting API  
- Focus tools: spotlight overlay + game  

---

## Key Features

### Focus & Shield
- Spotlight overlay (circle / rectangular)  
- Timed focus blocks with check-ins  
- AI-powered “micro-starts”  
- Small relaxation game for mental resets  

### Scholarship Tools
- Parse deadlines, values, references from scholarship text  
- Detect AI policy restrictions (e.g., coach-only)  
- Eligibility check driven by scholarship text + user profile  
- Clear “Matched from your profile” vs “Unclear / Missing info”  

### Profile + Autofill
- Save personal data (name, address, citizenship)  
- Save school/program/degree type  
- Save graduation month/year  
- Autofill forms automatically on scholarship websites  

### Scholarship Library
- Save scholarship pages to backend  
- View saved items in popup  
- Load scraped scholarship pages via /scholarships  

---

## Notes

- This project is designed for ADHD users.  
- The goal is to reduce friction, anxiety, and overwhelm when applying for scholarships.  
- Helps students start tasks, stay engaged, and understand requirements clearly.  
- Uses explainable and safe prompting, aligned with the Hackathon rules.
