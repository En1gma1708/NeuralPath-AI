# Conversation Summary — running context for this Claude Code session

Purpose: a live scratch summary of in-progress, not-yet-in-DEVLOG state, so context
survives a compaction event mid-task. Update this whenever something material happens
mid-session. Once a piece of work is actually finished, it graduates into a proper
`DEVLOG.md` entry and can be dropped from here — this file should stay short and only
reflect what's currently in flight.

---

## Current in-flight task: Phase 1 — dataset acquisition (next step)

**Status as of 2026-07-12:** GPU training environment setup is DONE and verified
end-to-end (TF 2.10 + CUDA 11.2 + cuDNN 8.1.1, RTX 2050 confirmed working via a
real `tf.matmul` on `/GPU:0`). Full detail in DEVLOG.md's 2026-07-12 entry and the
`project_phase1_gpu_setup` memory file — don't re-read the old setup blow-by-blow
below unless troubleshooting a regression; it's historical now.

**Next actual step:** download and inspect the Kaggle Brain Tumor MRI Dataset onto
`D:\NeuralPath-AI-data\dataset\` — class counts, image sizes/formats, obvious
quality issues (duplicates, corrupt files, label noise) — per the Phase 1
execution checklist in `docs/SCHEDULE.md`.

---

### Historical: GPU setup troubleshooting log (resolved, kept for reference)

**Decision chain (don't re-litigate):**
- WSL2 considered and rejected — too much setup effort given user is also doing an
  internship project concurrently.
- Chosen path: pin `tensorflow==2.10` on native Windows (last version with native
  Windows GPU support), rather than CPU-only or WSL2.
- Python 3.10.11 installed via winget (`Python.Python.3.10`) alongside existing
  3.11/3.12, because TF 2.10's Windows GPU wheel requires Python ≤3.10.
- Created `C:\Projects\NeuralPath-AI\training_env` venv using `py -3.10 -m venv
  training_env`. Pip upgraded inside it. **TensorFlow not yet pip-installed.**
- Confirmed system has NVIDIA driver only (591.74) — no CUDA toolkit, no cuDNN.
- TF 2.10 GPU needs CUDA **11.2** + cuDNN **8.1** specifically (version-pinned).
  winget only has CUDA 13.3 (too new) — not usable, must get 11.2 from NVIDIA's
  archive manually.
- Gave user step-by-step manual instructions (both require browser + NVIDIA login,
  cannot be automated by Claude):
  1. Download CUDA 11.2 local installer from
     `developer.nvidia.com/cuda-11.2.0-download-archive` (Windows/x86_64/exe local),
     Custom install, keep CUDA Development+Runtime, **don't let it downgrade the
     existing newer display driver**.
  2. Download cuDNN v8.1.1 for CUDA 11.2 from
     `developer.nvidia.com/rdp/cudnn-archive` (needs free NVIDIA Developer account
     login) — Windows x86 zip.
  3. Manually copy cuDNN's `bin/`, `include/`, `lib/` contents into
     `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v11.2\`.

**Update 2026-07-12: CUDA 11.2 + cuDNN 8.1.1 install completed and verified.**
Hit two snags along the way, both resolved:
- CUDA installer blocked by "newer NVIDIA FrameView SDK installed" — fixed by
  uninstalling FrameView SDK via its registry uninstall string (needed elevation).
- User initially grabbed the wrong cuDNN zip (`cudnn-10.2-...`) because NVIDIA's
  archive page has near-identical CUDA 10.2 and CUDA 11.x download links next to
  each other — corrected to `cudnn-11.2-windows-x64-v8.1.1.33.zip`.
cuDNN's `bin/include/lib` copied into the CUDA v11.2 directory via elevated
PowerShell (Program Files needs admin rights). Full details in the
`project_phase1_gpu_setup` memory file.

**Next step when resuming:** TensorFlow 2.10 install into `training_env` is in
progress (`pip install tensorflow==2.10`). Once done, verify GPU visibility via
`python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"`
— should show the RTX 2050. If it doesn't, check the CUDA/cuDNN DLLs are on PATH
(may need to add `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v11.2\bin` to
system PATH if TF can't find them — check before assuming a reinstall is needed).

**Do NOT re-propose:** WSL2 (explicitly rejected), continuous/live learning from user
uploads (rejected in `NOVELTY_PLAN.md` Phase 2c for regulatory/feedback-loop reasons).

**Storage decision (2026-07-12):** `C:` had only ~15GB free (mostly Steam + app
caches, unrelated to this project — user declined cleanup help for now, handling it
separately). Created `D:\NeuralPath-AI-data\dataset\` and
`D:\NeuralPath-AI-data\checkpoints\` on the external USB HDD ("Elements", D:, 632GB
free). Kaggle dataset and trained model checkpoints go there. Repo, `training_env`,
`backend/venv`, and CUDA/cuDNN stay on `C:` (need fast I/O + stable paths; D: is a
USB HDD — slow for active dev, fine for bulk read-mostly storage). Documented in
CLAUDE.md. When writing the data-loading script, point it at `D:\NeuralPath-AI-data\
dataset\`, not a project-local folder.

---

## Standing working-model facts (also in CLAUDE.md — kept brief here as a pointer)

- ~4 productive days/week, not daily. Claude executes phases directly; teaching is
  after-the-fact, on request.
- **Never `git commit` or `git push`** without being explicitly asked in the moment —
  user doesn't want Claude as a visible GitHub co-author.
- Full phase list and rationale: `docs/NOVELTY_PLAN.md`. Day-to-day log:
  `docs/DEVLOG.md`. This file is *not* a replacement for either — it's short-lived
  scratch state for whatever's mid-flight right now.
