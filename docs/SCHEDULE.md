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

External dataset sourcing resolved 2026-08-19/21 — see `docs/NOVELTY_PLAN.md`'s
Phase 2c section for the full research trail (candidates ruled out, why).
No single dataset with independent provenance covers all 4 classes, so this
is a composite of 4 separately-sourced, verified-independent single-class
sets (final sourcing, after the meningioma access wall was resolved):
- Glioma: TCIA UPENN-GBM (100 patients, 300 slices, T1 post-contrast — CC
  BY 4.0, fully open/scriptable via `tcia_utils`)
- Meningioma: BraTS Pre-operative Meningioma Dataset via Synapse
  `syn51514106` (100 patients, 299 slices, T1-CE, mask-guided slice
  selection using the dataset's own tumor segmentation masks — TCIA's
  MENINGIOMA-SEG-CLASS was ruled out, requires dbGaP approval restricted to
  senior researchers)
- Pituitary: OpenNeuro `ds006248` (50 patients, 150 slices, coronal T1-CE,
  mask-guided slice selection — switched from a 47.2GB Figshare dataset,
  too large for available disk)
- No-tumor: IXI Dataset (100 subjects, 300 slices, T1 — via a GitHub
  Releases mirror since brain-development.org 403s scripted requests)

1. ✅ (2026-08-19/21) Identify and verify an independent source per class —
   done via research passes that actively checked each candidate's own
   paper/citations for overlap with the training lineage (Figshare
   Cheng2017, Sartaj Bhuvaji, masoudnickparvar, BR35H, BraTS) rather than
   assuming independence from absence of evidence. Ruled out 7+ candidates
   this way (including BRISC, a 2026 peer-reviewed dataset that looked
   independent until its own citations were checked directly, and TCIA's
   MENINGIOMA-SEG-CLASS, which turned out to require dbGaP approval).
2. ✅ (2026-08-21) Downloaded all 4 sources into `local_data/external_
   validation/raw/<class>/` (later migrated to `D:\NeuralPath-AI-data\
   external_validation\` alongside the training dataset, see the storage
   migration entry in `docs/DEVLOG.md`) — never mixed with training data.
3. ✅ (2026-08-21) Preprocessed each source to match the training pipeline:
   224×224, grayscale-replicated-to-3ch, `efficientnet.preprocess_input`.
   Real bugs hit and fixed: IXI/OpenNeuro NIfTI volumes have oblique
   affines (fixed via `nibabel.as_closest_canonical()`); a first meningioma
   attempt used slices with no tumor-mask verification and often didn't
   show the tumor at all (fixed by switching to the BraTS training zip,
   which has masks, and picking the slice with the most tumor-labeled
   voxels per patient).
4. ✅ (2026-08-21) Ran the fine-tuned model (unmodified, no retraining)
   against the full composite external set (`model/eval_external_
   validation.py`). **Result: 68.45% external accuracy vs. 94.42%
   in-distribution — a 25.97-point generalization gap.** Per-class:
   pituitary 100%/no-tumor 99%/glioma 49%/meningioma 41% recall. Full
   numbers in `docs/METRICS.md`.
5. ✅ (2026-08-21) Used Phase 2's MC-Dropout uncertainty signal on the
   external set (`model/eval_external_mc_dropout.py`) — motivated by a
   user-flagged concern that pituitary/no-tumor's near-perfect recall might
   reflect a bias rather than genuine skill, which checking confidence
   scores confirmed: the model is *more* confident (0.919) when wrongly
   predicting no-tumor for meningioma than when correctly predicting it
   (0.845). MC-Dropout entropy separation degrades under distribution shift
   (2.45x vs. 7.17x in-distribution) and is **also inverted** for this
   specific failure mode — real evidence that neither raw confidence nor
   MC-Dropout catches the model's most costly error type.
6. ✅ (2026-08-21) Implemented a **partial, calibrated** low-confidence
   mitigation in `ml_service.py`'s `predict()`: an asymmetric decision rule
   requiring the notumor class to clear a 0.90 probability threshold before
   winning outright, calibrated against real external data
   (`model/calibrate_notumor_threshold.py`), not picked blind. Catches 34%
   of tumors the model would have silently called "no tumor" (78/232 on
   the external set), at a cost of 2 new false flags on 295 genuinely
   healthy scans. **Explicitly documented as partial, not a fix** — the
   underlying score distributions genuinely overlap (median
   notumor-probability was 0.97 even on the wrong cases), so no threshold
   fully solves this. API response now includes `notumor_override_applied`;
   surfaced in the frontend as a small amber badge.
7. Test the flagging against a deliberately out-of-distribution input (e.g. a
   non-MRI image, or a wrong scan type) to confirm it actually flags rather
   than confidently misclassifying — **not yet done**.
8. ✅ (2026-08-21) Documented the external-validation numbers, the
   composite design's limitations, and the flagging mechanism's real
   (partial) behavior in `docs/METRICS.md` for Phase 3's narrative.
9. ✅ (2026-08-21) Logged in `docs/DEVLOG.md`, this checklist and
   `docs/NOVELTY_PLAN.md`'s status updated.

**Two properly-scoped follow-ups, not done this session** (see
`docs/NOVELTY_PLAN.md`'s Phase 2c section for full scope/rationale — these
are real, separate pieces of work, not quick add-ons):
10. Source additional independently-provenanced training-eligible data per
    tumor class, verify leakage-safety, retrain, re-measure the
    generalization gap — the actual fix for the root cause, not the
    decision-rule mitigation in item 6.
    - ✅ (2026-08-22) Sourcing research done (two passes — broad
      institutional sweep, then a wider forums/GitHub/papers dig). Found
      viable independent sources for glioma (CFB-GBM, TCIA), pituitary
      (Figshare pituitary NET dataset), and notumor (HCP Young Adult).
      **Meningioma: no viable source found** — every candidate is either
      already spent on external validation, shares the existing training
      lineage, or is now dbGaP-gated (TCIA Meningioma-SEG-CLASS, gate
      became more formal in July 2025, not less). Full detail and evidence
      per candidate in `docs/NOVELTY_PLAN.md`'s Phase 2c section.
    - ✅ (2026-08-22) User decision: proceed with the 3 viable classes now,
      leave meningioma's training data unchanged, documented as a real
      limitation (not silently dropped) given meningioma is the worst
      external-recall class (41%).
    - [ ] Download + preprocess the 3 sources.
      - ✅ (2026-08-22) Pituitary (Figshare, `download_pituitary_extra_train.py`):
        done — 192 slices from 64 patients saved to
        `D:\NeuralPath-AI-data\extra_train_data\raw\pituitary\`, mask-guided
        slice selection, visually verified (correct axial orientation,
        sella-region framing). The ~44GB download hit two real mid-transfer
        failures (silent process death, no Python traceback - looked like a
        network/host-level connection drop, not a code bug) before adding
        real HTTP Range-header resume + retry logic to the script; also hit
        one silent extraction-phase failure (same symptom) that just
        required a plain re-run since the zip was already complete by then.
        Zip kept at `_scratch_pituitary/Pituitary_MRI_tumor_carotids.zip`
        per the no-premature-deletion rule - delete it yourself once
        satisfied.
      - ❌ Glioma (CFB-GBM, TCIA): blocked, then **scope-dropped entirely**
        (2026-08-23). CFB-GBM was NIfTI-only and TCIA's own Faspex server
        500-errored on the package (confirmed reproducible, a real bug on
        TCIA's end, not fixable client-side). The fallback, TCGA-GBM/
        TCGA-LGG, requires a human-reviewed TCIA Restricted License
        application — real hassle, uncertain approval odds for a
        non-institutional student project. **User decision: not worth it
        — drop TCGA/glioma sourcing entirely, no gated-access data at
        all.** Draft application (`docs/tcia_restricted_license_exhibit_
        a_draft.md`) deleted. Documented as a permanent limitation, not a
        pending task.
      - ❌ Notumor (HCP Young Adult): abandoned (2026-08-22) — genuine dead
        end, not user error. ConnectomeDB was fully decommissioned into
        "ConnectomeDB powered by BALSA" (Sept/Oct 2025); BALSA's own
        AWS-S3-credential button ("Get/Reset AWS S3 Access") 500-errors on
        every attempt; its Aspera download flow checks for **IBM Aspera
        Connect**, a product that reached end-of-life in June 2026 and is
        no longer distributable anywhere — confirmed via direct testing
        (the CDN installer URL 403s) and IBM's own EOL notice. All 3 of
        BALSA's documented access paths for HCP-YA are independently
        broken.
      - ❌ Notumor's OASIS-1 fallback also **scope-dropped** (2026-08-23),
        despite being genuinely public/no-application (confirmed live via
        direct HTTP 200 against `download.nrg.wustl.edu`'s static
        archives). Reason: it's 1.5T/2007-era data with a real,
        undismissable domain-shift risk (scanner-signature shortcut
        instead of genuine tumor-vs-no-tumor signal) against training data
        that's presumably 3T-era — fighting that risk with
        normalization/resolution-matching mitigations is exactly the kind
        of extra hassle the user chose to avoid for a student project.
        Scratch download deleted. **Notumor's training data stays
        unchanged, documented as a permanent limitation alongside
        meningioma**, not a pending task.
    - ✅ (2026-08-23) Pituitary merged: 192 sourced slices converted PNG→JPEG
      (matching the existing dataset's format;
      `data_pipeline.py`'s `tf.io.decode_jpeg` required this) and copied into
      `DATASET_DIR/Training/pituitary/` (1400 → 1592 files), prefixed
      `ExtraTr-pi_*.jpg` to keep provenance visible. `build_split.py`
      re-run to regenerate the leakage-safe manifest — its existing
      perceptual-hash clustering handles leakage-checking automatically, no
      separate verification step needed.
    - ✅ (2026-08-23) Retrained (`train.py` → `finetune.py`) on the updated
      manifest. First attempt regressed external accuracy (68.45%→65.11%)
      — root-caused to an axial-vs-coronal imaging-plane mismatch between
      the new pituitary source and the existing training data (see
      `docs/DEVLOG.md`'s 2026-08-23 "continued" entry for the full
      diagnosis). Fixed the slicing axis in
      `download_pituitary_extra_train.py`, re-extracted from the
      already-downloaded zip, re-merged, retrained again.
    - ✅ (2026-08-23) Re-measured the generalization gap, including the
      required meningioma-specific check (precision/recall, since its
      training data was unchanged): meningioma held up (within ~2pts of
      baseline on held-out test; external recall dipped slightly,
      57%→51%, a disclosed trade-off not a silent regression). **Final
      result beats the original baseline**: held-out test 94.42%→94.88%,
      external accuracy 68.45%→72.83%, generalization gap 25.97→21.59pts.
      Full numbers in `docs/METRICS.md`. Backend serving checkpoint
      updated; prior versions backed up for rollback.
    - **Permanent limitations (documented, not pending):** meningioma and
      notumor's training data could not be expanded with independently-
      sourced data without either gated/institutional access (TCGA, BALSA/
      HCP, OASIS-3) or accepting a real domain-shift risk (OASIS-1) — none
      of which fit a public-data-only, no-institutional-hassle student
      project. Only **pituitary** was successfully expanded (1 of 4
      classes). This asymmetry (pituitary improved, others static) is
      itself worth calling out explicitly in any write-up/interview
      discussion of this work, and the re-measurement step above must
      check it didn't skew relative performance further.
11. Find a second independent external-validation source per class to
    check whether the 25.97-point gap's magnitude (not just its direction)
    holds up against a broader sample than one source per class.

## Phase 2d — execution checklist (tool-calling agent for the chat assistant)

**DONE (2026-08-23).** Scope decided 2026-08-18: narrow and real — ground
the chat's answers about its own outputs, not a general autonomous agent
loop. Depends on Phase 2b (retrieval tool) and benefits from Phase 2c
(external-validation tool).

1. ✅ 3 tools defined: `get_uncertainty_details(entropy, level)`,
   `retrieve_medical_reference(query)`, `get_external_validation_stats()`.
   No `prediction_id`/persistence layer exists in this app (chat is
   stateless, given prediction/confidence/probabilities per-request
   already) — rather than inventing one, `uncertainty` (entropy/level,
   already computed at predict time) is passed through the same way and
   handed to the tool as real arguments, not looked up server-side.
2. ✅ `get_uncertainty_details` explains the real entropy value against
   this model's actual calibration numbers (correct-prediction mean
   ~0.077, incorrect-prediction mean ~0.554, from `mc_dropout_eval.py`'s
   held-out test run) — not a stub.
3. ✅ Phase 2b's `retriever.retrieve()` wrapped as `retrieve_medical_
   reference`, reused not reimplemented. Previously always-on per message;
   now only called when the LLM decides a question needs it.
4. ✅ `get_external_validation_stats()` returns the real 2026-08-23 retrain
   numbers (94.88% in-distribution / 72.83% external / 21.59pt gap /
   per-class external recall) as a hardcoded snapshot — the eval script
   runs offline against a local dataset, not something the deployed
   backend can query live, same reasoning as why `docs/METRICS.md` itself
   is a snapshot, not a live dashboard.
5. ✅ `backend/llm_service.py`'s `radiologist_chat` rewritten for
   tool-calling via `ChatGroq.bind_tools()` — a single tool-call round
   trip (call → execute → feed results back → final answer), matching the
   existing Groq `openai/gpt-oss-20b` setup. `backend/main.py`'s
   `/api/chat` and the frontend's chat call site updated to pass
   `uncertainty` through.
6. ✅ Tested via direct API calls (not just the UI) against exactly the
   questions this checklist named: "how confident are you really?" →
   correctly invoked `get_uncertainty_details`, cited entropy 0.741 and
   the real calibration thresholds. "is this consistent with known
   meningioma presentation?" → correctly invoked `retrieve_medical_
   reference`, cited StatPearls. "would this hold up on a different
   hospital's scans?" → correctly invoked `get_external_validation_stats`,
   cited the real 72.8%/94.9%/51% numbers. A neutral "thank you" message
   correctly invoked no tools. All 4 confirmed by inspecting the actual
   tool the model chose, not just that a plausible answer came back.
7. ✅ Before/after and real tool-call examples logged in
   `docs/DEVLOG.md`'s 2026-08-23 Phase 2d entry — the actual interview
   evidence.
8. ✅ This checklist and `docs/NOVELTY_PLAN.md` updated.

## Phase 3 — execution checklist (interview narrative write-up)

**DONE (2026-08-23).** Compiled into `docs/INTERVIEW_NARRATIVE.md`, using
the final/current numbers (post Phase 2d, post the pituitary retrain) —
every figure traced directly to `docs/METRICS.md`, none restated/rounded.

1. ✅ Sensitivity/specificity trade-off write-up (§2): per-class
   precision/recall on the current held-out test set, why recall matters
   more than precision for the tumor classes, meningioma flagged as the
   consistently hardest class with two independent signals (lowest
   accuracy AND highest predictive entropy) agreeing.
2. ✅ Grad-CAM write-up (§3): what it proves (spatial attention in the
   final conv layer) vs. doesn't (not causal, resolution-limited, can
   highlight a plausible-but-wrong region, not validated against
   radiologist ground truth) — illustrated concretely using this
   project's own axial/coronal plane-mismatch bug as an example of a
   failure Grad-CAM alone would not have caught. No separate "known
   issues" note existed for this in `CLAUDE.md` beyond the
   `_build_gradcam_model()` engineering bug-fix docstring — that
   engineering story (nested-submodel graph disconnection) is included
   too, as a distinct point from the epistemic-limits discussion.
3. ✅ Production-grade validation gap write-up (§4): what this project did
   (leakage-safe split, validated uncertainty, real external validation,
   root-caused regressions) vs. what's still missing (radiologist-annotated
   masks, multi-reader studies, broader multi-site external sampling,
   prospective validation, FDA-style change control) — stated as a
   specific gap, not a vague disclaimer.
4. ✅ Generalization-gap write-up (§5): the full measured story — 25.97pt
   original gap, the miscalibration finding (confidence/entropy both
   inverted on meningioma's worst failure mode), the calibrated decision
   rule's honest partial-fix framing, and the pituitary retrain's full
   arc (regression found → root-caused → fixed → net improvement,
   21.59pt final gap).
5. ✅ Continuous-learning write-up (§6): the 3 real reasons (no ground
   truth at inference, catastrophic forgetting risk, regulatory/HIPAA
   conflict) and the human-in-the-loop alternative, framed as designed-
   not-built and why that's the honest choice.
6. ✅ Compiled into `docs/INTERVIEW_NARRATIVE.md`. Also added a §7 not in
   the original checklist: the two genuine negative results (glioma/
   notumor extra-data sourcing scope-limited by deliberate choice, and the
   second-external-source search coming up empty) — worth including since
   they're honest, investigated dead ends, not gaps that were never
   looked at. Plus a §8 quick-reference talking-points summary for actual
   interview use.
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
