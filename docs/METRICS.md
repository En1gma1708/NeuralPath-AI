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
| End-to-end `/api/predict` latency, warm, before Phase 2 (no MC-Dropout) | mean 0.79s (min 0.71s, max 0.88s, n=10) | Local dev, CPU-only (`tensorflow-cpu==2.10.0`), single sequential requests, single 224×224 MRI image, includes preprocessing + inference + Grad-CAM + heatmap overlay encoding | 2026-07-31 | manual curl timing against local `uvicorn` |
| First-request latency (cold, incl. TF graph tracing) | 2.31s | Same conditions, first request after server startup | 2026-07-31 | manual curl timing |
| End-to-end `/api/predict` latency, warm, **after** Phase 2 (30-pass MC-Dropout added) | ~14-15s (14.0s, 14.9s, 14.6s across 3 runs) | Same conditions as above, single sequential requests | 2026-08-18 | manual curl timing against local `uvicorn` |

**Honest trade-off, not hidden:** MC-Dropout adds ~18x latency (30 sequential
CPU forward passes) for the uncertainty signal. This is a real cost worth
naming directly in the interview write-up — a legitimate discussion point
about the accuracy/calibration vs. latency trade-off in clinical AI, and
about how a production system would address it (e.g. fewer passes, batched/
parallel passes, GPU serving, or making the uncertainty pass optional/async
rather than blocking every request) rather than something to optimize away
silently before it's ever measured.

Not yet measured: deployed-instance latency (Render free tier vs AWS EC2 once
Phase 4 infra work happens), batch endpoint latency, p95/p99 under concurrent
load — this is a single-user local dev measurement, not a load test.

## Uncertainty quantification (Phase 2, MC-Dropout)

| Metric | Value | Split | Date | Source run |
|---|---|---|---|---|
| Method | MC-Dropout, 30 stochastic forward passes/image (dropout forced active via `training=True`; frozen EfficientNetB0 base's BatchNorm stays in inference mode) | — | 2026-08-18 | `model/mc_dropout_eval.py` |
| MC-Dropout mean-prediction accuracy | 94.52% | held-out test (1,094 images) | 2026-08-18 | `mc_dropout_eval.py` (compare to single-pass 94.42% — nearly identical, as expected) |
| Mean predictive entropy, correct predictions | 0.0773 | held-out test | 2026-08-18 | `mc_dropout_eval.py` |
| Mean predictive entropy, incorrect predictions | 0.5542 | held-out test | 2026-08-18 | `mc_dropout_eval.py` |
| **Entropy separation ratio (incorrect / correct)** | **7.17x** | held-out test | 2026-08-18 | `mc_dropout_eval.py` |
| Mean confidence, correct predictions | 97.18% | held-out test | 2026-08-18 | `mc_dropout_eval.py` |
| Mean confidence, incorrect predictions | 74.59% | held-out test | 2026-08-18 | `mc_dropout_eval.py` |

Per-class mean predictive entropy (held-out test set):

| Class | Entropy | Accuracy | Support |
|---|---|---|---|
| Glioma | 0.1135 | 93.70% | 270 |
| Meningioma | 0.1861 | 92.48% | 266 |
| No tumor | 0.0428 | 96.48% | 284 |
| Pituitary | 0.0761 | 95.26% | 274 |

**Meningioma also shows the highest per-class predictive entropy** — the
same class that was the model's hardest in Phase 1 (lowest F1). This is a
coherent, reinforcing finding: the uncertainty signal is picking up on a
real, independently-confirmed source of difficulty, not noise.

**Verdict: the uncertainty signal is real and usable.** A 7.17x entropy
separation between correct and incorrect predictions is a strong result —
this justifies presenting it as a genuine differentiator, not just "we also
added a number that looks like calibration."

## Grounded RAG (Phase 2b, chat assistant)

| Metric | Value | Date | Source |
|---|---|---|---|
| Corpus | 4 documents, real and sourced (not fabricated) | 2026-08-18 | `backend/rag_corpus/*.md` |
| Corpus sources | StatPearls (NCBI Bookshelf/NIH): glioma, meningioma, pituitary adenoma; RadiologyInfo.org (RSNA/ACR): normal/no-tumor MRI reports | 2026-08-18 | frontmatter in each `rag_corpus/*.md` file |
| Chunks indexed | 22 (chunked by markdown heading, topic-coherent sections) | 2026-08-18 | `build_rag_index.py` |
| Embedding model | `all-MiniLM-L6-v2` (local, `sentence-transformers`, no external API key) | 2026-08-18 | `build_rag_index.py` |
| Vector store | FAISS, `IndexFlatIP` on normalized vectors (cosine similarity) | 2026-08-18 | `retriever.py` |
| Retrieval threshold | `min_score=0.35`, calibrated empirically — irrelevant queries scored 0.06-0.07, relevant ones 0.49-0.75 | 2026-08-18 | manual score-distribution check |

**Before/after example (real, from a running server, question: "What is a
dural tail sign and why does it matter for my diagnosis?" on a Meningioma
prediction):**

*Before (ungrounded, pre-Phase 2b prompt):* correctly explained the dural
tail sign and its diagnostic significance, but with no traceable source —
just the model's own parametric knowledge, unverifiable and uncited.

*After (grounded, Phase 2b):* same core facts, explicitly cited: *"Per
clinical reference material (StatPearls, 'Imaging Characteristics'), this
sign is a key feature that radiologists look for when evaluating
meningiomas."*

**Honest finding, not oversold:** on this specific example, both answers
were factually correct — dural tail signs are well-established, commonly
known medical knowledge already present in the base model's training data,
so this test case doesn't demonstrate the ungrounded model *failing*. The
real, demonstrable value is **citability and verifiability**: the grounded
answer's claims trace to a specific, checkable source; the ungrounded one
doesn't, regardless of whether it happened to be correct this time. That
distinction — not "the old answer was wrong" — is the honest interview
talking point about hallucination risk in clinical LLM applications: a
model can be right by chance with no way to verify it, which is itself the
risk RAG mitigates, whether or not any single test question exposes an
actual factual error.

**Known limitation, documented not hidden:** embedding-similarity retrieval
alone can't perfectly separate "how confident is the *model* about its own
prediction" from "confidence" as a medical term — "how confident are you
really about this diagnosis?" still retrieves medical corpus passages at
~0.49 similarity, above the 0.35 threshold. This is a real gap that Phase
2d's dedicated `get_uncertainty_details()` tool is meant to close (giving
the assistant a better mechanism than RAG for that specific question type),
not something threshold-tuning alone can fully solve.

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
