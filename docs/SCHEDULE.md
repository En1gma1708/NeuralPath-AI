# Build Schedule — NeuralPath AI Revamp

Companion to `docs/NOVELTY_PLAN.md` (the "what and why") — this is the "when," broken
into weeks and days. Update the checkboxes as work happens; log the actual work done
in `docs/DEVLOG.md` as usual.

## Constraints this schedule is built around

- **Timeline**: real interview is 3-6 months out.
- **Working model (updated 2026-07-08):** user is now in an internship and can only
  work on this project ~4 high-productivity days per week (not daily, not
  weekend-only — a recurring but partial weekly window). Given that, **Claude
  executes each phase directly** (builds, trains, evaluates, integrates) rather
  than pairing through it step-by-step. Teaching/theory happens **after** a phase
  is done, on request — not forced inline as each phase is built. This trades the
  original "learn alongside building" pacing for faster elapsed throughput per
  phase; DEVLOG.md entries are the record of what was built and why, and are the
  starting point whenever the user wants a walkthrough of a completed phase.
- **This is a revamp, not a from-zero build.** Frontend, API layer, Grad-CAM, LLM
  integration already exist and work end-to-end (against a fake model). Don't
  re-learn/re-derive things that already work — extend and fix them.
- **Dual purpose**: this is also the project for an internship that started
  2026-07-06, which requires an original project built *during* the internship.
  Commit history should genuinely reflect incremental work across the ~4
  productive days/week cadence above.
- **Cross-cutting requirements** (see NOVELTY_PLAN.md): HIPAA-aware data handling
  and clean scalable architecture, applied as each phase is built, not a separate
  phase.
- **Estimated elapsed time at this cadence: ~6-7 weeks** across Phases 1-5 (see
  DEVLOG.md 2026-07-08 entry for the per-phase hour breakdown this is based on).

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

## Phase 1 — execution checklist (replaces old daily "theory alongside" breakdown)

Claude executes these directly; no forced inline teaching. Ask for a walkthrough
of any completed step whenever you want it — DEVLOG.md entries are the anchor.

1. Set up training environment: Python env for training (separate from
   `backend/venv` — training deps like `tensorflow` w/ GPU support, `kagglehub` or
   manual download, differ from the CPU-serving backend deps). Verify local GPU is
   visible to TensorFlow (RTX 2050, 4GB VRAM).
2. Download and inspect the Kaggle Brain Tumor MRI Dataset: class counts, image
   sizes/formats, sample visual inspection, look for obvious quality issues
   (duplicates, corrupt files, label noise). Log a short EDA summary in DEVLOG.md.
3. Design and document the train/val/test split (stratified by class, fixed seed
   for reproducibility) and the data augmentation strategy — justify each choice,
   check for patient-level leakage risk between splits.
4. Implement the data loading/split script and the EfficientNetB0
   transfer-learning model definition (frozen base + new classification head).
5. ✅ (2026-07-31) First training run (frozen base); watch curves for
   overfitting/class-imbalance issues. Result: 88.12% held-out test accuracy,
   no over/underfitting detected, meningioma is the weak class (76.3%
   precision) — see `docs/METRICS.md` and DEVLOG 2026-07-31 entry.
6. Fine-tuning pass (unfreeze top layers, lower learning rate) if frozen-base
   results are reasonable but not great. Save the trained model artifact with
   exact reproduction steps (seed, splits, hyperparameters) — audit-rigor
   requirement, not optional. ← NEXT STEP
7. Preliminary evaluation on the held-out test set; full rigorous evaluation
   (confusion matrix, per-class metrics, error analysis) follows before Phase 1
   is marked done.
8. Log the completed phase in DEVLOG.md and update NOVELTY_PLAN.md's status
   checklist.

## Status
- [ ] Week 1 complete
- [ ] Week 2 complete
- [ ] Week 3 complete
- [ ] Week 4 complete
- [ ] Week 5 complete
- [ ] Week 6 complete
