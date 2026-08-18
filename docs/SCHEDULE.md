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
- **Personal project, not an internship deliverable.** (Corrected 2026-07-31 —
  an earlier note here incorrectly claimed this project doubled as a required
  internship deliverable; the internship only explains the reduced ~4
  days/week cadence above, nothing more.) Commit history reflecting
  incremental work is still good practice, just not a separate requirement
  imposed by the internship.
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
6. ✅ (2026-07-31) Fine-tuning pass (unfreeze top layers, lower learning
   rate). Result: 94.42% held-out test accuracy (+6.3 pts over frozen-base),
   meningioma precision/recall gap substantially closed. See
   `docs/METRICS.md` and DEVLOG 2026-07-31 (later) entry.
7. ✅ (2026-07-31) Evaluation numbers produced (`check_fit.py` on the
   fine-tuned model — confusion matrix, per-class precision/recall/F1, see
   `docs/METRICS.md`). Formal write-up prose for Phase 3 is still open, but
   the underlying rigorous evaluation itself is done.
8. ✅ (2026-07-31) Real model wired into `backend/` (`ml_service.py`,
   `model_def.py`), mock `VGGSKin.h5` retired, verified end-to-end
   (real prediction + real Grad-CAM heatmap against the running server).
   See DEVLOG 2026-07-31 (final) entry. **Phase 1 core work is done** —
   remaining open item is Phase 3's narrative prose, not new experimentation.

## Phase 2 — execution checklist (uncertainty quantification)

**Method decided 2026-07-31: MC-Dropout**, not conformal prediction. Rationale:
the model already has a `Dropout(0.3)` layer in its head (`model_def.py`), so
MC-Dropout needs no architecture change — just running inference multiple
times with dropout forced active at inference time and treating the spread
across those runs as an uncertainty signal. Conformal prediction would need a
dedicated calibration split carved out of the data and is a heavier lift for
a second differentiator; simplicity won given Phase 1 already used most of
the "real ML rigor" interview budget.

1. ✅ (2026-08-18) Implement MC-Dropout inference: force `training=True` on
   the model call (Dropout in the head goes stochastic; frozen EfficientNetB0
   base's BatchNorm verified to stay in inference mode via `base.trainable =
   False`), run N=30 forward passes per image.
2. ✅ (2026-08-18) Compute uncertainty metrics from the N passes: mean
   prediction distribution, predictive entropy (on the mean distribution,
   the standard MC-Dropout measure) as the uncertainty signal.
3. ✅ (2026-08-18) Validated on the full held-out test set
   (`model/mc_dropout_eval.py`) before shipping: incorrect predictions show
   **7.17x higher predictive entropy** than correct ones; meningioma (Phase
   1's known weak class) also has the highest per-class entropy — a
   coherent, reinforcing result. See `docs/METRICS.md`.
4. ✅ (2026-08-18) Wired into `backend/ml_service.py`'s `predict()` — added
   `estimate_uncertainty()` and a new `uncertainty` field (predictive
   entropy + low/medium/high label) in the `/api/predict` response.
   Deliberately additive: the existing single-pass prediction/confidence/
   Grad-CAM stayed unchanged, MC-Dropout runs as a supplementary signal so
   Phase 1's documented numbers don't shift.
5. ✅ (2026-08-18) Frontend updated (`frontend/src/app/predict/page.tsx`):
   `PredictionResult` interface now has `uncertainty`, single-scan view
   shows a low/medium/high badge + raw entropy next to the confidence bar,
   batch queue view shows a compact colored dot per row (space-constrained
   layout). No new API mapping needed — both single and batch paths already
   passed the raw API response straight into state.
6. ✅ (2026-08-18) Measured and documented real latency cost: ~14-15s/request
   with MC-Dropout vs. ~0.79s without (~18x increase, 30 sequential CPU
   passes) — logged honestly in `docs/METRICS.md`, including what a
   production system would do about it.
7. ✅ (2026-08-18) Logged in `docs/DEVLOG.md`, this checklist and
   `docs/NOVELTY_PLAN.md`'s status updated. **Phase 2's ML/backend work is
   done** — only the frontend display step (5) remains open.

## Phase 2b — execution checklist (grounded RAG for chat assistant)

1. Assemble the curated medical reference corpus: WHO CNS tumor
   classification excerpts, public radiology reference text on
   glioma/meningioma/pituitary presentation. Keep it small and
   purpose-built, not a scraped dump — document sources for the write-up.
2. Chunk the corpus and generate embeddings; stand up a lightweight vector
   store (FAISS or Chroma — pick one, document why).
3. Build the retrieval step: given a user's chat message (plus the current
   prediction context, as `radiologist_chat` already receives), retrieve the
   top-k relevant passages from the corpus.
4. Modify `backend/llm_service.py`'s `radiologist_chat` to ground its answer
   in the retrieved passages — the model should cite/base its response on
   retrieved text, not just answer from parametric knowledge as it does now.
5. Test against known-tricky questions (e.g. ones where the ungrounded model
   might currently hallucinate specifics) — verify retrieved context actually
   changes/grounds the answer, not just gets silently ignored by the LLM.
6. Document the corpus, retrieval method, and a before/after example
   (ungrounded vs. grounded answer to the same question) for the Phase 3
   interview narrative — this is the actual interview talking point, not just
   the implementation.
7. Log results in `docs/DEVLOG.md`, update this checklist and
   `docs/NOVELTY_PLAN.md`'s status.

## Phase 2c — execution checklist (external validation + OOD flagging)

Sequencing note: item 2 below reuses Phase 2's MC-Dropout uncertainty output,
so this phase is easiest done after Phase 2, not before.

1. Identify and acquire a second public brain tumor MRI dataset — different
   source/collection than the masoudnickparvar Kaggle set used in Phase 1 (a
   real external test, not another split of the same data).
2. Run the fine-tuned model (unmodified, no retraining) against this external
   set. Report the accuracy/per-class metric drop vs. the in-distribution
   held-out test set (94.42%) honestly — this number is expected to be worse,
   and that's the point: it measures the real generalization gap rather than
   asserting one exists.
3. Using Phase 2's MC-Dropout uncertainty signal, check whether
   external-set inputs (a proxy for distribution shift) show measurably
   higher uncertainty than in-distribution test inputs — if the uncertainty
   signal doesn't rise on shifted data, its practical value as an "OOD
   flag" is weaker than claimed, and that itself is worth reporting honestly.
4. Implement a low-confidence/OOD flagging threshold in `ml_service.py`'s
   `predict()` — inputs above the uncertainty threshold get flagged for
   review rather than returning a bare confident class label, regardless of
   which of the 4 classes softmax picked.
5. Test the flagging against a deliberately out-of-distribution input (e.g. a
   non-MRI image, or a wrong scan type) to confirm it actually flags rather
   than confidently misclassifying — this is the concrete "what happens when
   someone uploads something the model has never really seen" mitigation.
6. Document the external-validation numbers and the flagging mechanism's
   real behavior (including its limits — flagging is a mitigation, not a
   solve) for Phase 3's narrative.
7. Log results in `docs/DEVLOG.md`, update this checklist and
   `docs/NOVELTY_PLAN.md`'s status.

## Status
- [ ] Week 1 complete
- [ ] Week 2 complete
- [ ] Week 3 complete
- [ ] Week 4 complete
- [ ] Week 5 complete
- [ ] Week 6 complete
