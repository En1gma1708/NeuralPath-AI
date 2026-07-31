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

**Current best model: EfficientNetB0, fine-tuned (block6 onward unfrozen, lr=1e-5)
— see "Fine-tuned model" below. This is the Phase 1 headline number.**

### Fine-tuned model (2026-07-31, `finetune.py`, current best)

| Metric | Value | Split | Date | Source run |
|---|---|---|---|---|
| Overall accuracy | 95.40% | val (1,066 images) | 2026-07-31 | `finetune.py`, epoch 15 (best) |
| Overall accuracy | **94.42%** | held-out test (1,094 images, never seen in training) | 2026-07-31 | `check_fit.py` |
| val − test accuracy gap | 0.98 pts | val vs test | 2026-07-31 | `check_fit.py` |
| Overfitting/underfitting check | none detected — val accuracy kept improving in step with train accuracy through all 15 epochs; final train-val gap 4.0 pts | train vs val, 15 epochs | 2026-07-31 | `check_fit.py` |
| Improvement over frozen-base pass | +6.30 pts test accuracy (88.12% → 94.42%) | test set | 2026-07-31 | `check_fit.py` (both runs) |

Per-class (held-out test set, 1,094 images):

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Glioma | 94.40% | 93.70% | 94.05% | 270 |
| Meningioma | 87.86% | 92.48% | 90.11% | 266 |
| No tumor | 98.56% | 96.13% | 97.33% | 284 |
| Pituitary | 97.03% | 95.26% | 96.13% | 274 |
| **Macro avg** | 94.46% | 94.39% | 94.41% | 1,094 |
| **Weighted avg** | 94.55% | 94.42% | 94.46% | 1,094 |

**Meningioma weak point substantially closed by fine-tuning:** precision
76.31% → 87.86% (+11.55 pts), recall 82.33% → 92.48% (+10.15 pts). Still the
model's hardest class in relative terms, but no longer a standout gap — tracks
with meningioma's known clinical visual heterogeneity rather than a fixable
pipeline issue.

### Frozen-base pass (2026-07-31, `train.py`, superseded by fine-tuning above — kept for the before/after comparison)

| Metric | Value | Split | Source run |
|---|---|---|---|
| Overall accuracy | 90.43% | val | `train.py`, epoch 7 (best) |
| Overall accuracy | 88.12% | held-out test | `check_fit.py` |
| Meningioma precision / recall | 76.31% / 82.33% | held-out test | `check_fit.py` |

## Training / compute

| Metric | Value | Date | Source run |
|---|---|---|---|
| Hardware | NVIDIA RTX 2050 laptop GPU, 4GB VRAM | 2026-07-31 | `train.py` / `finetune.py` |
| Training time (frozen-base pass) | 4.7 min, 11 epochs (early-stopped, patience=4) | 2026-07-31 | `train.py` |
| Training time (fine-tuning pass) | 9.2 min, 15 epochs (ran to completion, still improving) | 2026-07-31 | `finetune.py` |
| Total params | 4,054,695 | 2026-07-31 | `model_def.py` |
| Trainable params (head only, frozen base) | 5,124 | 2026-07-31 | `model_def.py` |
| Trainable params (fine-tuning, block6 onward unfrozen) | 3,135,008 | 2026-07-31 | `finetune.py` |
| Fine-tuning learning rate | 1e-5 (~100x lower than the frozen-base pass's 1e-3) | 2026-07-31 | `finetune.py` |
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
