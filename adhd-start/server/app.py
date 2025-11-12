# server/app.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.schemas import PlanIn, PlanOut
from server.llm import make_plan_with_llm  # <- use your LLM helper

app = FastAPI()

# allow calls from your chrome extension / localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # fine for hackathon
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/plan", response_model=PlanOut)
def make_plan(payload: PlanIn):
    # call Claude to make an ADHD-friendly plan
    plan_dict = make_plan_with_llm(payload.goal, payload.text)
    # make sure it matches the schema
    return PlanOut(**plan_dict)
