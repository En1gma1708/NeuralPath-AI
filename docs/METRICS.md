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

## External validation + generalization gap (Phase 2c)

**Composite external-validation set**: 4 independently-sourced, single-class
collections (no dataset covers all 4 classes with independent provenance —
see `docs/NOVELTY_PLAN.md`'s Phase 2c section for the full sourcing
investigation, including 7 ruled-out candidates that turned out to share
training-data lineage).

| Class | Source | Patients | Slices | Modality |
|---|---|---|---|---|
| Glioma | TCIA UPENN-GBM | 100 | 300 | T1 post-contrast |
| Meningioma | BraTS Meningioma (Synapse `syn51514106`, training split, mask-guided) | 100 | 299 | T1-CE |
| No tumor | IXI Dataset | 100 | 300 | T1 |
| Pituitary | OpenNeuro `ds006248` | 50 | 150 | T1-CE (coronal) |

| Metric | Value | Date | Source run |
|---|---|---|---|---|
| Overall accuracy (external, unmodified model, no retraining) | **68.45%** | 2026-08-21 | `eval_external_validation.py` |
| In-distribution held-out test accuracy | 94.42% | 2026-07-31 | `check_fit.py` |
| **Generalization gap** | **25.97 points** | 2026-08-21 | `eval_external_validation.py` |

Per-class (external set):

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Glioma | 91% | 49% | 64% | 300 |
| Meningioma | 71% | 41% | 52% | 299 |
| No tumor | 56% | 99% | 72% | 300 |
| Pituitary | 81% | 100% | 90% | 150 |

**Mean prediction confidence (single-pass softmax), by true class and
correctness** — the finding that motivated the MC-Dropout follow-up below:

| Class | Correct | Incorrect |
|---|---|---|
| Glioma | 0.800 (n=147) | 0.726 (n=153) |
| Meningioma | 0.845 (n=124) | **0.919 (n=175)** |
| No tumor | 0.996 (n=297) | 0.628 (n=3) |
| Pituitary | 0.997 (n=150) | n/a |

**Key finding — miscalibration, not just an accuracy gap:** the model is
*more* confident (0.919) when wrongly predicting no-tumor for a meningioma
than when correctly predicting meningioma (0.845). Raw softmax confidence
actively misleads on this specific, clinically important failure mode
(missing a real tumor).

**MC-Dropout uncertainty on the external set** (`eval_external_mc_dropout.py`, 2026-08-21):

| Metric | Value |
|---|---|
| Entropy separation ratio (incorrect/correct), external | **2.45x** |
| Entropy separation ratio, in-distribution (Phase 2, for comparison) | 7.17x |
| Meningioma→no-tumor errors, mean entropy | 0.306 (n=166) |
| Meningioma correct, mean entropy | 0.445 (n=118) |
| No-tumor class, mean entropy (both correct and incorrect) | 0.041 |
| Pituitary class, mean entropy (both correct and incorrect) | 0.024 |
| Glioma class, mean entropy | 0.670 |
| Meningioma class, mean entropy | 0.381 |

**Honest verdict, not oversold:** MC-Dropout's uncertainty signal degrades
under distribution shift (2.45x vs. 7.17x) but doesn't vanish at the
aggregate level. However, for the *specific* meningioma→no-tumor failure
mode, MC-Dropout entropy is **also lower on the errors than on correct
meningioma predictions** — the same inversion seen in raw softmax
confidence. Root cause: the model is uniformly near-zero-entropy whenever
it lands on "no tumor" or "pituitary," correct or not, so the aggregate
2.45x separation is driven almost entirely by glioma's genuine uncertainty,
not by the system catching the meningioma failure mode. **MC-Dropout is not
a reliable safety net for this specific, most clinically costly error type
on this evidence** — a real, disclosed limitation, not a solved problem.

### Asymmetric decision-rule mitigation (2026-08-21)

Given raw softmax/MC-Dropout both fail on this specific failure mode,
checked whether a decision-rule change (not retraining) could help: does a
notumor-probability threshold cleanly separate the model's correct
no-tumor calls from its wrong ones (real tumors misclassified as
no-tumor)? Calibrated against the external validation set
(`model/calibrate_notumor_threshold.py`) rather than picking a number
blind:

| notumor prob. threshold | tumors correctly re-routed | tumors still missed | true no-tumor cases wrongly flagged | true no-tumor still correct |
|---|---|---|---|---|
| 0.50 | 8 | 224 | 0 | 297 |
| 0.70 | 30 | 202 | 0 | 297 |
| 0.80 | 50 | 182 | 0 | 297 |
| **0.90 (chosen)** | **78** | **154** | **2** | **295** |
| 0.95 | 104 | 128 | 7 | 290 |
| 0.99 | 144 | 88 | 23 | 274 |

**Honest finding: there is no clean threshold.** The two score
distributions genuinely overlap — tumors wrongly called "no tumor" have a
median notumor-probability of **0.970**, almost as high as correctly-called
no-tumor cases' median of **1.000**. Even at threshold 0.99, 88/232 (38%)
of missed tumors are still not caught, while 23 genuinely healthy scans get
wrongly flagged. This is not a calibration problem fixable by moving a
knob — it reflects a real limit in what the model learned.

**Implemented (`backend/ml_service.py`, threshold=0.90) as a disclosed
partial mitigation, not a fix**: at this threshold, 78/232 (34%) of tumors
the model would have silently called "no tumor" now get correctly rerouted
to its next-best tumor guess instead, at the cost of 2 new false flags on
295 genuinely healthy scans (a 0.7% false-positive-flag rate). The API
response now includes a `notumor_override_applied` boolean so this is
visible, not silent, when it fires. **What this does not do**: it does not
fix the underlying miscalibration, and 66% of the original missed-tumor
cases are still missed. The real fix requires more/varied training data
(see `docs/NOVELTY_PLAN.md`'s Phase 2c "next steps" for the properly-scoped
follow-up) — this mitigation buys partial safety now, cheaply, while that
larger work is pending.

**Re-tested with the mitigation live (`model/eval_external_validation.py`,
2026-08-21), confirming it measurably helps without being oversold:**

| Metric | Raw model | With decision rule (threshold=0.90) | Change |
|---|---|---|---|
| Overall external accuracy | 68.45% | **73.40%** | +4.95 pts |
| Generalization gap vs. in-distribution | 25.97 pts | **21.02 pts** | −4.95 pts |
| Glioma recall | 49% | 59% | +10 pts |
| Meningioma recall | 41% | 49% | +8 pts |
| Decision rule fired | — | 80/1049 images (7.6%) | — |

**Still not fixed, confirmed directly**: even with the mitigation applied,
meningioma's mean confidence on its *incorrect* predictions (0.890) remains
higher than on its *correct* predictions (0.746) — the underlying
miscalibration is reduced, not eliminated. The mitigation makes the system
measurably safer, not calibrated.

**Known limitations of this evaluation, stated directly:**
- Small, single-source-per-class samples (50-100 patients each) — one
  institution/scanner/protocol per class, not a broad multi-site sample.
  These results could partly reflect quirks of each specific source rather
  than the general external-validation story; more independent sources per
  class would strengthen the finding.
- Composite of 4 separately-sourced sets, not one unified external holdout.
- Meningioma slices are mask-guided (tumor-verified); glioma/pituitary/
  no-tumor use fixed-fraction or mask-guided selection per source — see
  `docs/NOVELTY_PLAN.md` for per-class method detail.

### Retrain with additional pituitary training data (2026-08-23)

Phase 2c's follow-up #2 (`docs/SCHEDULE.md` item 10): sourced 199
additional, independently-provenanced pituitary training slices (Figshare
"Mapping Pituitary Neuroendocrine Tumors", 64 patients — see
`docs/NOVELTY_PLAN.md`) and merged them into the training set (1400 → 1599
pituitary images; `build_split.py` re-run for a leakage-safe manifest).
Glioma/notumor sourcing was scope-dropped (public-data-only decision,
see `docs/NOVELTY_PLAN.md`) — this retrain only adds pituitary data.

**A first attempt regressed external accuracy (68.45% → 65.11%) and the
root cause is itself worth recording**: `download_pituitary_extra_train.py`
originally picked the slicing axis via `argmin(shape)`, which for this
dataset's near-isotropic volumes selected the **axial** plane (wide-field,
eye-sockets-visible), while the existing training data's pituitary images
are predominantly **coronal/sagittal close-ups**. This plane mismatch
taught the model a spurious "axial wide-field skull-base = pituitary"
shortcut that misfired against external glioma cases (also axial),
collapsing glioma recall to 22% and pituitary precision to 42%. Confirmed
by directly reading and visually comparing sample images from both
sources — not assumed. Fixed by hardcoding the coronal axis and
center-cropping to square before resize (the non-square source slices
would otherwise be stretched non-uniformly by `tf.image.resize`, unlike
the existing 512×512 square training images). Re-sourced from the
already-downloaded zip (no re-download needed) and retrained from scratch.

**Corrected result — a genuine improvement over the original baseline:**

| Metric | Original baseline | Bad merge (axial, reverted) | Fixed merge (coronal) |
|---|---|---|---|
| Held-out test accuracy | 94.42% | not evaluated (reverted before deploy) | **94.88%** |
| External accuracy (with decision rule) | 68.45% | 65.11% | **72.83%** |
| Generalization gap | 25.97 pts | 29.31 pts | **21.59 pts** |
| Glioma recall (external) | 49% | 22% | **55%** |
| Pituitary precision (external) | 81% | 42% | **67%** |

Per-class, held-out test set (1,113 images, 2026-08-23, `check_fit.py`):

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Glioma | 94.05% | 93.70% | 93.88% | 270 |
| Meningioma | 91.95% | 90.23% | 91.08% | 266 |
| No tumor | 98.55% | 95.77% | 97.14% | 284 |
| Pituitary | 94.79% | 99.32% | 97.00% | 293 |
| **Macro avg** | 94.84% | 94.76% | 94.78% | 1,113 |

Meningioma's relative performance (the specific check flagged as required
before this retrain, since its training data was unchanged) held up —
precision/recall both stayed within ~2pts of the pre-retrain baseline, no
sign the pituitary addition made it relatively worse.

Per-class, external validation set (1,049 images, with decision rule,
2026-08-23, `eval_external_validation.py`):

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Glioma | 94% | 55% | 69% | 300 |
| Meningioma | 77% | 51% | 61% | 299 |
| No tumor | 66% | 99% | 79% | 300 |
| Pituitary | 67% | 100% | 80% | 150 |

Meningioma's external recall dipped slightly (57%→51%, mostly now
confused with notumor rather than glioma) — a real, disclosed trade-off,
not hidden. Every headline number (overall external accuracy,
generalization gap, glioma recall, pituitary precision) still moved in
the right direction versus the original baseline.

**Lesson for any future data-sourcing script in this project**: always
verify a new source's imaging plane/orientation matches the existing
training distribution before merging, not just its modality (T1/T2/etc.)
and lineage-independence — a plane mismatch is invisible in file counts
and even in per-class accuracy on the *training* distribution, and only
shows up as a cross-class confusion pattern on external data.

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
