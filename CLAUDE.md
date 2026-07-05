# CLAUDE.md — NeuralPath AI (Brain Pathology using Deep Learning)

Project context for Claude Code. Read `docs/NOVELTY_PLAN.md`, `docs/SCHEDULE.md`, and
`docs/DEVLOG.md` before starting work — they carry the active plan, the week/day-by-day
build schedule, and history across sessions.

## What this project is

A full-stack brain MRI tumor classification app (glioma / meningioma / pituitary / no
tumor), being reworked as interview prep for a **DeepHealth AI** (breast-imaging /
mammography AI, clinically deployed) job application. The end goal is technical
credibility and one genuine research-grade differentiator — not UI polish.

GitHub: `En1gma1708/NeuralPath-AI`.

## Structure

- `frontend/` — Next.js 15 (App Router), Tailwind, shadcn/ui, Framer Motion, Three.js
  for a 3D brain visualization. Has its own `frontend/CLAUDE.md` → `frontend/AGENTS.md`
  (Next.js version-specific warning — read it before touching frontend code).
- `backend/` — FastAPI inference server.
  - `backend/main.py` — API routes: `/api/predict`, `/api/predict/batch` (max 20),
    `/api/report`, `/api/chat`, `/health`.
  - `backend/ml_service.py` — preprocessing (128×128 resize), inference, Grad-CAM
    heatmap generation, report string assembly.
  - `backend/llm_service.py` — Groq Llama-3.1 (`llama-3.1-8b-instant`) via LangChain:
    generates a formatted "radiology report" and powers a chat assistant. **Only
    receives the classification label/confidence/summary — never the image or
    heatmap.**
  - `backend/model/VGGSKin.h5` — see "Known issues" below.
- `model/generate_mock_model.py` — generates a random, untrained placeholder model.
  There is a duplicate copy at `backend/model/generate_mock_model.py`.
- `docs/NOVELTY_PLAN.md` — the interview-prep strategy and phased plan.
- `docs/DEVLOG.md` — chronological work log. Append an entry here after each work
  session (what changed, why, what's next).
- Note: there is a nested `NeuralPath-AI/` directory inside the repo root that appears
  to duplicate `frontend/`/`backend/` — treat as legacy/duplicate, confirm with user
  before modifying anything inside it.

## Known issues (do not treat as solved without checking first)

- **The model is not trained.** `VGGSKin.h5` is produced by `generate_mock_model.py` —
  a random 1-conv-layer network, not a real classifier. There is no training script,
  dataset, or evaluation metrics in the repo as of 2026-07-05. Do not present accuracy
  numbers or confidence scores from this model as meaningful until this is fixed.
- **`VGGSKin` naming** is a leftover from an apparently unrelated skin-lesion project —
  rename once a real model exists.
- **No uncertainty quantification** — softmax output is currently presented directly as
  "confidence," which is known to be overconfident/miscalibrated for clinical use.
- **The LLM report is decorative**, not diagnostic — it rephrases a label into
  radiology-report prose and fabricates placeholder fields (e.g. "Patient
  Demographics: [Not Provided]"). Don't extend this pattern (e.g. don't make the LLM
  more "diagnostic-sounding") without discussing it with the user — it currently reads
  as clinically naive, and that's a known problem for the interview-prep goal.

## Commands

- Backend: `cd backend && uvicorn main:app --reload` (port 8000). Deps in
  `backend/requirements.txt` (`tensorflow-cpu`, `opencv-python-headless`,
  `langchain-groq`, etc). Needs `backend/.env` with `GROQ_API_KEY` (see
  `backend/.env.example`).
- Frontend: `cd frontend && npm run dev` / `npm run build` / `npm run lint`.
- Regenerate mock model (placeholder only, not a real train step):
  `python model/generate_mock_model.py`.

## Working conventions for this project

- This is interview-prep work — prioritize **honesty and rigor** in the ML pipeline
  over impressive-looking output. If a change would make something look more
  sophisticated without being more correct (e.g. dressing up softmax confidence,
  embellishing the LLM report), flag it instead of just doing it.
- Follow the phased plan in `docs/NOVELTY_PLAN.md` unless the user redirects.
- After any non-trivial work session (code changes, training runs, dataset decisions),
  add a dated entry to `docs/DEVLOG.md` (newest entry at top) and update the checklist
  in `docs/NOVELTY_PLAN.md` if a phase completed.
