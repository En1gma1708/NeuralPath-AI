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

## Week-by-week arc (superseded — see note below)

Original plan (2026-07-05), kept for context on the original intended pacing:
Week 1 data+model, Week 2 eval+backend integration, Week 3 uncertainty
quantification, Week 4 RAG, Week 5 compliance/infra, Week 6 polish+narrative+buffer.

**Actual pacing turned out very different, and that's fine — this file said
"revise when that happens," so this is that revision (2026-08-18):** Phases 1, 2,
and 2b all landed across two real work sessions (2026-07-31 and 2026-08-18), not
four separate weeks — once GPU/data setup was solved, each subsequent phase moved
much faster than a week-per-phase estimate assumed. Phase 2c and 2d didn't exist in
the original arc at all (added 2026-07-05-later and 2026-08-18 respectively). Given
how much faster real phases have gone than the week-based estimate, **this file no
longer tracks progress by week** — the per-phase checklists below (each phase's own
section) and `docs/NOVELTY_PLAN.md`'s Status checklist are the accurate source of
truth for what's done. The Week 1-6 checkboxes at the bottom of this file are kept
only as a historical artifact of the original estimate, not a live tracker.

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

1. ✅ (2026-08-18) Assembled the curated medical reference corpus: 4 real,
   sourced documents (`backend/rag_corpus/*.md`) — glioma, meningioma, and
   pituitary adenoma from StatPearls (NCBI Bookshelf/NIH), plus a
   "normal/no-tumor MRI report" reference from RadiologyInfo.org
   (RSNA/ACR). Each file has YAML frontmatter recording its real source URL
   and retrieval date — genuinely researched and sourced, not fabricated or
   written from memory (deliberately chosen over that, to actually earn the
   "grounded, citable" claim this phase exists to deliver).
2. ✅ (2026-08-18) Chunked by markdown heading (22 chunks total — naturally
   topic-coherent sections like "Imaging Characteristics," "Management"),
   embedded with local `sentence-transformers` (`all-MiniLM-L6-v2` — no
   external API key, no per-call cost, consistent with the project's
   free-tier posture), indexed in FAISS (`IndexFlatIP` on normalized
   vectors = cosine similarity). Build script: `backend/build_rag_index.py`.
3. ✅ (2026-08-18) `backend/retriever.py`: singleton retriever (loaded once,
   like `ml_service.py`'s model), `retrieve(query, top_k, min_score)`
   returns scored chunks above a similarity threshold. Calibrated the
   threshold empirically: clearly irrelevant queries scored ~0.06-0.07,
   genuinely relevant ones 0.49-0.75 — settled on `min_score=0.35`.
4. ✅ (2026-08-18) `radiologist_chat` now retrieves top-3 passages per
   message and includes them in the prompt as explicit reference material,
   instructed to cite the source and defer to it over its own guesses.
   Empty retrieval (no chunk clears the threshold) is handled as a valid
   outcome, not an error — the chat still answers, just ungrounded for that
   message.
5. ✅ (2026-08-18) Tested end-to-end against a running server: a
   meningioma-specific question correctly retrieved and cited the dural-tail
   passage; a clearly off-topic question ("what's the capital of France")
   correctly retrieved nothing; a fully unrelated chat message ("what
   should I eat for breakfast") correctly redirected without a fabricated
   citation.
6. ✅ (2026-08-18) Documented corpus, method, and a real before/after
   example in `docs/METRICS.md` — **honest finding, not oversold**: on the
   specific example tested, both the ungrounded and grounded answers were
   factually correct (dural tail signs are well-established, commonly-known
   medical knowledge already in the base model's training data). The real,
   demonstrable difference is that the grounded answer explicitly cites its
   source ("Per clinical reference material (StatPearls, 'Imaging
   Characteristics')"), while the ungrounded answer presents the same facts
   with no traceable origin. Also found and documented a real limitation:
   embedding similarity alone can't perfectly distinguish "how confident is
   the *model*" from "confidence" as a medical term — a query like "how
   confident are you really about this diagnosis?" still retrieves medical
   passages at ~0.49 similarity. This is exactly the gap Phase 2d's
   dedicated uncertainty tool is meant to close, not something to
   over-engineer away with threshold tuning alone.
7. ✅ (2026-08-18) Logged in `docs/DEVLOG.md`, this checklist and
   `docs/NOVELTY_PLAN.md`'s status updated. **Also fixed, unrelated but
   found along the way**: Groq fully retired `llama-3.1-8b-instant` (used
   by both `radiologist_chat` and `generate_medical_report`) — swapped to
   `openai/gpt-oss-20b` in both places after confirming via the Groq
   models API which models are currently available.

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

## Phase 2d — execution checklist (tool-calling agent for the chat assistant)

Scope decided 2026-08-18: narrow and real — ground the chat's answers about
its own outputs, not a general autonomous agent loop. Depends on Phase 2b
(retrieval tool) and benefits from Phase 2c (external-validation tool).

1. Define the tool schema/interface the LLM will call against (function
   signatures, expected args/returns) for the 2-3 tools: uncertainty lookup,
   retrieval, external-validation stats.
2. Implement `get_uncertainty_details(prediction_id)` — a real backend
   function that returns the actual MC-Dropout entropy/confidence numbers
   for a given prediction, not a stub or hardcoded value.
3. Wire in the Phase 2b retrieval function as a second callable tool
   (reuse, don't reimplement, the Phase 2b retriever).
4. Implement `get_external_validation_stats()` once Phase 2c exists — reads
   the real measured generalization-gap numbers, not placeholder text.
5. Modify `backend/llm_service.py`'s `radiologist_chat` to support tool
   calling (via LangChain's tool-calling support, matching the existing
   Groq Llama-3.1 setup) — the model decides which tool(s), if any, to
   invoke per user message, rather than always retrieving or never
   retrieving.
6. Test against questions specifically designed to require each tool (e.g.
   "how confident are you really?" → uncertainty tool; "is this consistent
   with known glioma presentation?" → retrieval; "would this hold up on a
   different hospital's scans?" → external-validation tool) and confirm the
   right tool actually gets invoked, not just that *a* plausible-sounding
   answer comes back.
7. Document a few real before/after examples (ungrounded LLM guess vs.
   tool-grounded answer to the same question) for Phase 3's narrative — this
   is the actual interview evidence, not just "we added function calling."
8. Log results in `docs/DEVLOG.md`, update this checklist and
   `docs/NOVELTY_PLAN.md`'s status.

## Phase 3 — execution checklist (interview narrative write-up)

Context: the underlying numbers already exist across Phases 1/2/2c
(`docs/METRICS.md`) — this phase is prose/narrative construction, not new
experimentation.

1. Write up the sensitivity/specificity trade-off discussion: what the
   model's real per-class precision/recall numbers (Phase 1) imply
   clinically, and why (e.g. missing a tumor vs. a false alarm carry
   different costs).
2. Write up what Grad-CAM does and doesn't prove — its real localization
   failure modes, not treated as ground truth (per the "known issues" note
   already in `CLAUDE.md`).
3. Write up what production-grade validation would actually require
   (radiologist-annotated masks, multi-reader studies) vs. what this project
   did — an honest gap statement, not a claim of clinical readiness.
4. Write up the generalization-gap discussion using Phase 2c's real
   external-validation numbers once they exist, plus how OOD/low-confidence
   flagging (Phase 2/2c) mitigates — not solves — that gap.
5. Write up why the system doesn't continuously learn from user uploads
   (the human-in-the-loop pipeline already designed and documented in
   `NOVELTY_PLAN.md`'s Phase 2c section) as the legitimate alternative.
6. Compile the full narrative into a single reviewable document (e.g.
   `docs/INTERVIEW_NARRATIVE.md`) pulling numbers directly from
   `docs/METRICS.md` — no restated/rounded numbers that drift from source.
7. Do a self-review pass: for each claim, confirm it traces to an actual
   measured result or an explicitly-labeled design decision, not an
   unsupported assertion.

## Phase 4 — execution checklist (Docker hardening + AWS free-tier deploy)

Context: `backend/Dockerfile` already exists but has a known issue found
during Phase 1 backend integration — its `python:3.11-slim` base conflicts
with the `tensorflow-cpu==2.10.0` pin (needs Python ≤3.10) added when the
real model was wired in. Fix this first, before anything else in this phase.

1. Fix the Dockerfile's Python base image (e.g. `python:3.10-slim`) so it
   can actually install the pinned `tensorflow-cpu==2.10.0` — build and run
   the container locally to confirm it starts and serves a real prediction
   before moving on.
2. Verify/hardening pass on the existing Dockerfile: multi-stage build if
   beneficial, non-root user, minimal final image size, no secrets baked
   into image layers.
3. Check TF-CPU + OpenCV's real memory footprint in the container (flagged
   as a risk in `NOVELTY_PLAN.md` — `t2.micro`'s 1GB RAM may OOM) — measure
   it, don't assume; fall back to `t3.micro` if needed.
4. Set up S3 (free tier) for the model artifact; modify the backend startup
   to load weights via boto3 from S3 instead of bundling them in the image.
5. Set up ECR (free tier) for the container image.
6. Set up EC2 (free tier, `t2.micro`/`t3.micro`) running the container;
   verify the deployed instance actually serves real predictions end-to-end
   (not just "the container starts").
7. Set up GitHub Actions: build the Docker image and push to ECR on merge
   to main — one CI/CD tool only, per the existing scope decision.
8. Measure and log real deployed-instance numbers in `docs/METRICS.md`:
   image size, cold-start time, deployed-instance latency (compared to the
   local-dev numbers already recorded).
9. Optional, only if it comes up naturally: replace localStorage-based scan
   history with a real Postgres-backed table.
10. Log results in `docs/DEVLOG.md`, update this checklist and
    `docs/NOVELTY_PLAN.md`'s status.

## Phase 5 — execution checklist (frontend polish)

Context: incremental only — styling/motion/layout, never touching
data-fetching, state management, or API contracts. Test each change against
the running dev server before moving to the next, not a large batch landed
at once.

1. Audit the current UI end-to-end (predict page, batch view, chat, history)
   and note specific rough edges to address — concrete list, not "make it
   nicer."
2. Apply an animation/motion pass using the existing Framer Motion
   dependency (page transitions, result reveals, micro-interactions) —
   incremental, verified in-browser after each change.
3. Apply a visual-design pass (spacing, typography, color) consistent with
   the existing shadcn/ui + next-themes (light/dark) setup — no new UI
   libraries introduced without a specific reason.
4. Revisit the 3D brain visualization (Three.js/@react-three/fiber) if it
   needs polish, without touching the underlying prediction data flow.
5. Full regression pass: confirm every existing feature (single predict,
   batch predict, chat, history, light/dark toggle) still works after the
   polish pass — this phase's explicit constraint is "don't break
   functionality."
6. Log results in `docs/DEVLOG.md`, update this checklist and
   `docs/NOVELTY_PLAN.md`'s status.

## Status

Week-based tracking retired (see the note under "Week-by-week arc" above) — use
`docs/NOVELTY_PLAN.md`'s Status checklist for the real, current per-phase status
(as of 2026-08-18: Phases 1, 2, 2b done; 2c, 2d, 3, 4, 5 not started; 21/56 total
tasks done across all phases' checklists above).
