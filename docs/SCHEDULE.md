# Build Schedule — NeuralPath AI Revamp

Companion to `docs/NOVELTY_PLAN.md` (the "what and why") — this is the "when," broken
into weeks and days. Update the checkboxes as work happens; log the actual work done
in `docs/DEVLOG.md` as usual.

## Constraints this schedule is built around

- **Timeline**: real interview is 3-6 months out. This project gets a dedicated
  ~4-6 week build window starting tomorrow, ~3-5 hrs/day, but paced deliberately
  (not rushed) — learning theory alongside building is a goal, not a nice-to-have.
- **This is a revamp, not a from-zero build.** Frontend, API layer, Grad-CAM, LLM
  integration already exist and work end-to-end (against a fake model). Don't
  re-learn/re-derive things that already work — extend and fix them.
- **Dual purpose**: this is also the project for a new internship starting
  tomorrow, which requires an original project built *during* the internship. Pace
  and commit history should genuinely reflect day-by-day incremental work — which
  is realistic here since literally no code has been written yet as of 2026-07-05.
- **Cross-cutting requirements** (see NOVELTY_PLAN.md): HIPAA-aware data handling
  and clean scalable architecture, applied as each phase is built, not a separate
  phase.

## Week-by-week arc

- **Week 1 — Data + real model, v1.** Dataset acquisition/EDA, training environment,
  first real EfficientNetB0 training run, baseline evaluation. Theory alongside:
  CNNs/transfer learning fundamentals, why evaluation metrics beyond accuracy matter
  for clinical classifiers.
- **Week 2 — Evaluation rigor + backend integration.** Proper held-out test
  evaluation, confusion matrix/per-class metrics, error analysis (which classes
  confuse the model and why), fix/retrain if needed, wire the real model into the
  FastAPI backend replacing the mock, verify Grad-CAM still works correctly against
  a real model. Theory: precision/recall/F1 trade-offs, calibration.
- **Week 3 — Uncertainty quantification (Phase 2).** Implement MC-dropout or
  conformal prediction, surface a real confidence interval in the UI instead of raw
  softmax. Theory: why softmax confidence is miscalibrated, Bayesian deep learning
  basics, conformal prediction intuition.
- **Week 4 — Grounded RAG for chat (Phase 2b).** Build the retrieval corpus,
  embeddings + vector search, wire into `radiologist_chat`. Theory: embeddings,
  retrieval, hallucination risk in clinical LLM use.
- **Week 5 — Compliance/scalability pass + infra (Phase 4).** Formalize HIPAA-aware
  practices and audit logging across everything built so far; Docker hardening;
  free-tier AWS (EC2 + S3 + ECR) + GitHub Actions CI.
- **Week 6 — Frontend polish (Phase 5) + interview narrative (Phase 3) + buffer.**
  UI/animation pass without touching data logic; write up the interview narrative
  (trade-offs, limitations, what production-grade validation would need); buffer for
  anything that overran.

This arc is a plan, not a contract — expect it to shift as we learn things (e.g.
training takes longer than expected, a technique doesn't pan out). Revise this file
when that happens and note why in DEVLOG.md.

## Week 1 — Day by day

**Day 1 (tomorrow):**
- Set up training environment: Python env for training (separate from
  `backend/venv` — training deps like `tensorflow` w/ GPU support, `kagglehub` or
  manual download, differ from the CPU-serving backend deps).
- Verify local GPU is visible to TensorFlow (RTX 2050, 4GB VRAM) — a real
  "does the tooling work at all" check before writing any training code.
- Download and inspect the Kaggle Brain Tumor MRI Dataset: class counts, image
  sizes/formats, sample visual inspection, look for obvious quality issues
  (duplicates, corrupt files, label noise).
- Theory alongside: what transfer learning is and why it's standard for small
  medical imaging datasets (7000 images is small by deep learning standards).
- Output: a short EDA summary (class balance, image stats) logged in DEVLOG.md.

**Day 2:**
- Design the train/val/test split (stratified by class, fixed seed for
  reproducibility — a HIPAA-adjacent/audit-rigor point: the exact split must be
  reproducible and documented, not ad hoc).
- Decide and document data augmentation strategy (rotation/flip/brightness —
  standard for MRI slices, but justify each choice rather than defaulting to a
  boilerplate augmentation pipeline).
- Theory alongside: why stratified splits matter, data leakage risks specific to
  medical imaging (e.g. same-patient slices ending up in both train and test —
  check if this dataset has patient IDs or is already de-duplicated by source).
- Output: data pipeline design decided and documented (still may not be coded yet
  depending on pace — see Day 3).

**Day 3:**
- Implement the data loading/split script.
- Implement the EfficientNetB0 transfer-learning model definition (frozen base +
  new classification head first, per standard transfer learning practice).
- Theory alongside: frozen-base vs fine-tuning strategy, why you start frozen
  before unfreezing layers.

**Day 4:**
- First real training run (frozen base). Watch training/validation curves for
  obvious problems (overfitting, class imbalance effects).
- Theory alongside: reading loss/accuracy curves, early stopping, learning rate
  basics.

**Day 5:**
- Fine-tuning pass (unfreeze some top layers of EfficientNetB0, lower learning
  rate) if frozen-base results are reasonable but not great.
- Save the trained model artifact, note exact reproduction steps (seed, splits,
  hyperparameters) — audit-rigor requirement, not optional.
- Output: a real trained `.h5`/`.keras` model file with a documented training run.

**Day 6-7 (buffer/lighter days):**
- Preliminary evaluation on the held-out test set (full rigorous evaluation is
  Week 2, but a first look here catches major problems early).
- Catch-up buffer if any earlier day overran — training runs are unpredictable.
- Log the week's work and update this schedule for Week 2 specifics based on
  what was actually learned.

## Status
- [ ] Week 1 complete
- [ ] Week 2 complete
- [ ] Week 3 complete
- [ ] Week 4 complete
- [ ] Week 5 complete
- [ ] Week 6 complete
