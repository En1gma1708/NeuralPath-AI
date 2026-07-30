# Metrics Log — real, measured numbers only

Purpose: a single place to record actual measured numbers from this project, for
resume bullets / interview talking points. **Every number here must come from a
real run logged in `docs/DEVLOG.md`** — no estimates, no rounding up, no numbers
that sound good. If a number can't be traced back to a script output or log, it
doesn't go in a resume.

Committed to git (not gitignored) — these are just measured results, no secrets/PHI,
and versioning them shows how the numbers evolved as phases were completed.

---

## Model performance

**Model: EfficientNetB0, frozen ImageNet base + Dropout(0.3)+Dense(4,softmax) head
only (no fine-tuning yet — Phase 1 step 6, not done). This is a first-pass baseline,
not the final Phase 1 number.**

| Metric | Value | Split | Date | Source run |
|---|---|---|---|---|
| Overall accuracy | 90.43% | val (1,066 images) | 2026-07-31 | `train.py`, epoch 7 (best) |
| Overall accuracy | 88.12% | held-out test (1,094 images, never seen in training) | 2026-07-31 | `check_fit.py` |
| val − test accuracy gap | 2.31 pts | val vs test | 2026-07-31 | `check_fit.py` |
| Overfitting/underfitting check | none detected — train/val loss & accuracy tracked closely, final train-val gap 2.5 pts | train vs val, 11 epochs | 2026-07-31 | `check_fit.py` |

Per-class (held-out test set, 1,094 images):

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Glioma | 92.86% | 81.85% | 87.01% | 270 |
| Meningioma | 76.31% | 82.33% | 79.20% | 266 |
| No tumor | 94.37% | 94.37% | 94.37% | 284 |
| Pituitary | 89.82% | 93.43% | 91.59% | 274 |
| **Macro avg** | 88.34% | 87.99% | 88.04% | 1,094 |
| **Weighted avg** | 88.47% | 88.12% | 88.17% | 1,094 |

**Known weak point (honest, not hidden):** meningioma is the model's hardest class
— lowest precision (76.3%) and second-lowest recall (82.3%). Confusion matrix shows
it's most often mistaken for pituitary (23 cases) and glioma (15 cases). This is a
legitimate interview talking point, not just a flaw: meningioma is clinically known
to be the most visually heterogeneous of the three tumor types on MRI, so this
tracks with a real difficulty, not a data/pipeline bug.

## Training / compute

| Metric | Value | Date | Source run |
|---|---|---|---|
| Hardware | NVIDIA RTX 2050 laptop GPU, 4GB VRAM | 2026-07-31 | `train.py` |
| Training time (frozen-base pass) | 4.7 min, 11 epochs (early-stopped, patience=4) | 2026-07-31 | `train.py` |
| Total params | 4,054,695 | 2026-07-31 | `model_def.py` |
| Trainable params (head only, frozen base) | 5,124 | 2026-07-31 | `model_def.py` |
| Dataset size (train/val/test) | 5,040 / 1,066 / 1,094 images | 2026-07-12 | `build_split.py` |
| Batch size | 16 | 2026-07-31 | `data_pipeline.py` |

## Inference latency

| Metric | Value | Conditions | Date | Source run |
|---|---|---|---|---|
| _pending_ | | | | |

To be measured once the real model is wired into `backend/main.py` (replacing the
mock) — end-to-end `/api/predict` latency (p50/p95 if measured over multiple runs),
on what hardware (local dev vs deployed Render instance), cold vs warm.

## Dataset / data quality

| Metric | Value | Date | Source |
|---|---|---|---|
| Total images | 7,200 | 2026-07-12 | `eda_dataset.py` |
| Classes | 4 (glioma, meningioma, notumor, pituitary), balanced 1,400/class train + 400/class test (Kaggle's original split) | 2026-07-12 | `eda_dataset.py` |
| Near-duplicate leakage found (Kaggle's provided split) | 294 perceptual-duplicate groups, 855 files (~12%) spanning Training/Testing | 2026-07-12 | `check_duplicates.py` |
| Leakage-safe split (rebuilt) | train=5,040 (70.0%) / val=1,066 (14.8%) / test=1,094 (15.2%), cluster-stratified, seed=42 | 2026-07-12 | `build_split.py` |

## Infra / deployment (Phase 4, later)

| Metric | Value | Date | Source |
|---|---|---|---|
| _pending_ | | | |

E.g. Docker image size, cold-start time on free-tier EC2, CI build time.

---

## How to use this for resume/ATS bullets

- Pull directly from a row here, don't paraphrase into something rounder/vaguer.
- Prefer specific + sourced over impressive-sounding: "91.1% val accuracy on a
  held-out, leakage-checked split (7,200-image dataset)" beats "high accuracy."
- If a number changes after a later phase (e.g. fine-tuning improves test
  accuracy), update the row and note both — don't just overwrite silently,
  since the delta itself ("uncertainty quantification cut miscalibration by
  X%") can be a stronger bullet than the raw endpoint number.
