#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8000}"

# cd into the app dir so "from server..." works
pushd adhd_start >/dev/null || { echo "❌ missing adhd_start/"; exit 1; }

# ensure package marker exists
[ -f server/__init__.py ] || touch server/__init__.py

# use the venv's python if you have one activated, else system python
python -m uvicorn server.app:app --port "$PORT" --reload &
PID=$!
popd >/dev/null

trap 'echo; echo "⏹ Stopping API ($PID)"; kill $PID 2>/dev/null || true' EXIT

sleep 2
echo "▶ Health:"
curl -s "http://localhost:$PORT/health" || true
echo; echo

echo "▶ Parse (sample scholarship text):"
curl -s -X POST "http://localhost:$PORT/parse" \
  -H "Content-Type: application/json" \
  -d @- <<'JSON'
{"user_id":"demo-user","text":"National Scholarship … Scholarship application deadline: 2025-10-31 23:59. One confidential reference letter required. Generative AI is not permitted in applications."}
JSON
echo; echo

echo "▶ Plan (goal + page text):"
curl -s -X POST "http://localhost:$PORT/plan" \
  -H "Content-Type: application/json" \
  -d @- <<'JSON'
{"user_id":"demo-user","goal":"Apply to this scholarship","text":"Application deadline: 2025-10-31. Policy: No AI-generated content."}
JSON
echo; echo

echo "✅ Smoke test finished."
