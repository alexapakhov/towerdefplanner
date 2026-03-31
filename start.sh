#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Tower Defense Level Planner ==="
echo ""

# --- Backend ---
echo "[1/3] Setting up Python backend..."
cd "$SCRIPT_DIR/backend"

if [ ! -d ".venv" ]; then
  echo "  Creating virtual environment..."
  python3 -m venv .venv
fi

source .venv/bin/activate

echo "  Installing Python dependencies..."
pip install -q -r requirements.txt

echo "  Starting backend on http://localhost:8002 ..."
uvicorn main:app --port 8002 --reload &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# --- Frontend ---
echo ""
echo "[2/3] Setting up frontend..."
cd "$SCRIPT_DIR/frontend"

if [ ! -d "node_modules" ]; then
  echo "  Installing npm dependencies (this may take a minute)..."
  npm install
fi

echo "  Starting frontend on http://localhost:5174 ..."
npm run dev -- --port 5174 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

echo ""
echo "[3/3] Services started!"
echo ""
echo "  Backend API:  http://localhost:8002"
echo "  Frontend App: http://localhost:5174"
echo ""
echo "Press Ctrl+C to stop both services."
echo ""

# Trap to clean up on exit
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

wait
