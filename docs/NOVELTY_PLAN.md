# NeuralPath AI — Novelty & Interview Readiness Plan

Goal: make this project defensible in a DeepHealth AI interview by fixing the credibility
gap in the ML core and adding one rigorous, clinically-relevant differentiator — not by
adding UI polish or LLM prompt engineering.

## Baseline assessment (2026-07-05)

Read in detail: `backend/ml_service.py`, `backend/main.py`, `backend/llm_service.py`,
`model/generate_mock_model.py`, `backend/requirements.txt`.

Findings:
- **The model is not trained.** `model/generate_mock_model.py` and
  `backend/model/generate_mock_model.py` build a random 1-conv-layer network and save it
  as `VGGSKin.h5`. No training script, notebook, dataset, or evaluation metrics exist in
  the repo.
- **`VGGSKin.h5`** — the filename is a leftover from an apparently unrelated skin-lesion
  project, repurposed for brain tumors. Signals templated/tutorial origin.
- **Pipeline**: resize to 128×128 → `model.predict()` → argmax → Grad-CAM overlay
  (`backend/ml_service.py:30-65`, legitimately implemented) → canned string report
  (`generate_detailed_report`) → separate Groq Llama-3.1 call
  (`backend/llm_service.py`) that rephrases the classification label into
  radiology-report language and powers a chat assistant. **The LLM never sees the image
  or the heatmap** — it dresses up a 4-class softmax output.
- No uncertainty quantification: raw softmax treated as "confidence."
- Grad-CAM output presented as ground truth with no discussion of its known
  localization failure modes.
- LLM report fabricates fields like "Patient Demographics: [Not Provided]" and issues
  prescriptive "Recommended Next Steps" — reads as clinically naive.

Conclusion: structurally a "Kaggle brain-tumor dataset + CNN + Grad-CAM + Next.js +
LLM chatbot" tutorial pattern. Solid full-stack engineering, no ML research
contribution, and currently no real trained weights at all.

## What DeepHealth AI cares about (context for framing)

Breast-imaging (mammography/tomosynthesis) AI, clinically deployed, FDA-adjacent,
validated via reader studies. What reads as relevant: real data handling, rigorous
validation methodology (sensitivity/specificity trade-offs), honest uncertainty, and
clinical framing — not a fancier chatbot.

## Plan

### Phase 1 — Credibility (real model, real numbers) — DONE (2026-07-31)

Original scope (2026-07-05):
- Train a real CNN / transfer-learning backbone (e.g. EfficientNet or ResNet) on an
  actual brain tumor MRI dataset (4 classes already implied: glioma, meningioma,
  pituitary, no tumor).
- Keep the training notebook/script in-repo.
- Report accuracy, precision/recall, per-class confusion matrix, on a proper held-out
  test set.
- Retire or clearly label the mock model; fix the `VGGSkin` naming.

**Decisions locked in (2026-07-05):**
- **Dataset**: Kaggle "Brain Tumor MRI Dataset" (masoudnickparvar) — ~7000 images,
  4 classes matching the existing labels exactly (Glioma, Meningioma, No Tumor,
  Pituitary). Chosen over an unspecified/custom source for direct citability in the
  writeup and exact label compatibility with the existing app.
- **Compute**: user has a local GPU — RTX 2050 (4GB VRAM laptop GPU) + Ryzen
  5000-series CPU. Training runs locally on this GPU, not Colab.
- **Architecture**: EfficientNetB0, ImageNet-pretrained, transfer learning, at
  224×224 input, batch size 16–32. Rationale: EfficientNetB0 (~5.3M params)
  comfortably fits 4GB VRAM at this batch size; a larger backbone (ResNet50,
  EfficientNetB3+) risks OOM or forces impractically small batches on this GPU.
  It's also a legitimate, modern, defensible choice to discuss in an interview
  (accuracy/efficiency tradeoff), not just "biggest model available."
- **Train/serve consistency**: `backend/requirements.txt` pins `tensorflow-cpu==2.10.0`
  to exactly match the training environment — no architecture or environment mismatch
  between training and the FastAPI serving path.

**Result (2026-07-31, full detail in `docs/DEVLOG.md`):** dataset downloaded, a real
train/test leakage bug found and fixed (near-duplicate MRI slices leaking across
Kaggle's provided split — rebuilt a cluster-stratified split from scratch), frozen-base
training (88.12% test accuracy) then fine-tuning (94.42% test accuracy, +6.3 pts,
meningioma precision/recall gap substantially closed), full evaluation (confusion
matrix, per-class F1), and backend integration — `VGGSKin.h5` and both
`generate_mock_model.py` copies deleted, real predictions serving from `backend/`.
Full numbers in `docs/METRICS.md`.

### Phase 2 — The actual novelty (DONE — MC-Dropout, 2026-08-18)

Original framing (2026-07-05): pick one of two candidates for **calibrated
uncertainty quantification**, surfaced in the UI as a confidence interval, not a
bare softmax number. Rationale: raw softmax confidence is known to be
overconfident/miscalibrated; this is exactly the kind of judgment a
clinical-risk-aware company probes for.

**Decided (2026-08-18): MC-Dropout**, not conformal prediction — the model
already has a `Dropout(0.3)` layer in its head, so no architecture change was
needed; conformal prediction would have required carving out a dedicated
calibration split for a second differentiator, a heavier lift given Phase 1
already used most of the "real ML rigor" budget. **Result: validated and
shipped.** Incorrect predictions show 7.17x higher predictive entropy than
correct ones on the held-out test set — a real, usable signal, not decoration.
Wired into `backend/ml_service.py` and the frontend. Full numbers in
`docs/METRICS.md`.

Secondary candidate (not done): validate Grad-CAM against real localization
(masks/bounding boxes if available) or explicitly discuss its failure modes in
the write-up — still open, folds into Phase 3's narrative if not built as code.

### Phase 2b — Grounded RAG for the chat assistant — DONE (2026-08-18)

Context: evaluated where RAG, MCP servers, and agentic AI could genuinely fit this
project (as opposed to being added for buzzword coverage), 2026-07-05. Conclusion
at the time: MCP has no natural consumer here (would mean inventing a use case,
skip entirely — still true) and agentic multi-tool orchestration didn't fit a
single-classifier app either. RAG is the one with a real, defensible use case.

**Revisited 2026-08-18** (after Phase 1/2 landed, giving the app something real
for an agent to actually reach for — see Phase 2d below): tool-calling has a
narrow but genuine fit now, scoped separately in Phase 2d rather than folded in
here. General multi-step agentic orchestration beyond that narrow case still
doesn't fit — not revised.

Problem it fixed: `backend/llm_service.py`'s `radiologist_chat` used to answer
medical questions purely from the LLM's parametric knowledge — ungrounded, no
citation, real hallucination risk for a "Dr. NeuralPath" persona making claims about
brain tumor conditions.

**Result (2026-08-18, full detail in `docs/DEVLOG.md` and `docs/METRICS.md`):**
grounded the chat in 4 real, sourced reference documents (StatPearls/NCBI Bookshelf
for glioma/meningioma/pituitary, RadiologyInfo.org/RSNA-ACR for no-tumor/normal MRI
reports — not the originally-proposed WHO CNS excerpts, chosen instead for public
accessibility and direct fetchability), via local `sentence-transformers` embeddings
+ FAISS (chosen over Chroma — lighter dependency, no persistence server needed for a
corpus this small). `radiologist_chat` now retrieves and cites relevant passages
instead of relying on the model "just knowing." Verified end-to-end; honest before/
after documented (the real, demonstrable value found was citability/verifiability,
not that the ungrounded model was factually wrong on the tested example — see
`docs/METRICS.md` for the full finding, including a documented limitation around
questions about the model's own confidence).

Sequencing: was after Phase 1/2, since it improves the LLM layer, not the classifier
credibility gap that Phase 1 fixed first.

### Phase 2c — Generalization gap: external validation + OOD flagging

Context: user asked what guarantees the model gives correct results on real hospital
images (different scanners/protocols/populations than the Kaggle training set) —
and separately asked whether the model could just continuously learn from every
uploaded image to handle this.

**On continuous/live learning — considered and rejected, documented here so it
doesn't get re-proposed later:**
- No ground truth exists at inference time — a prediction is not a confirmed
  diagnosis. Training on the model's own unconfirmed predictions risks a
  confirmation-bias feedback loop (model reinforces its own mistakes, can become
  more confidently wrong over time), not improvement.
- True online/incremental learning risks catastrophic forgetting without careful
  techniques (replay buffers, regularization) that are themselves active research
  problems, not something to bolt on here.
- Real regulatory/compliance issue: silently retraining a shared model on a user's
  uploaded scan without explicit consent conflicts directly with the HIPAA-aware
  design goal already in this plan. This is also why FDA-cleared medical AI models
  are locked at a specific validated version — the FDA's Predetermined Change
  Control Plan framework exists specifically because uncontrolled post-deployment
  model drift is treated as a safety risk, not a feature.
- The legitimate version of "the system improves over time" is a **human-in-the-loop
  pipeline**: radiologist confirms/corrects predictions → confirmed labels
  accumulate → periodic (e.g. quarterly) retraining on verified data → new model
  version re-evaluated before replacing the old one. This is a real, defensible
  architecture to *design and document* (diagram + writeup), even without an actual
  hospital feeding it — added to Phase 3's interview narrative rather than built as
  running code.

**What's actually being built for this phase (two things, chosen over the above):**
1. **External-dataset validation.** Hold out a second, different public brain tumor
   MRI dataset (not used in training — a different source/collection than the
   masoudnickparvar Kaggle set chosen in Phase 1) as a true external validation set.
   Report the accuracy/per-class metric drop compared to the in-distribution test
   set. This turns "the model might not generalize to other scanners/populations"
   from a caveat into an empirically measured number — a strong, honest interview
   data point about the real distribution-shift problem in clinical imaging.
2. **OOD / low-confidence flagging.** Use the uncertainty quantification already
   planned in Phase 2 (MC-dropout or conformal prediction) to flag inputs the model
   is not confident about — including genuinely out-of-distribution inputs (wrong
   scan type, non-MRI images, unusual artifacts) — rather than always confidently
   emitting one of the 4 softmax classes regardless of input. This is the concrete,
   buildable mitigation for "what happens when someone uploads something the model
   has never really seen."

Explicitly not building: any form of automatic retraining from user uploads, and no
claim that the model is validated for real hospital use — that would require actual
clinical validation this project cannot perform. The honest position, stated
directly in the writeup: performance outside the training distribution is unknown
until measured (item 1) and the system is designed to flag rather than hide that
uncertainty (item 2).

Sequencing: after Phase 1 (needs a real trained model to evaluate) and alongside
Phase 2 (shares the same uncertainty-quantification implementation).

**External dataset sourcing — resolved 2026-08-19, composite design.** The
original plan assumed one drop-in "different Kaggle dataset" would work. It
doesn't: nearly every public 4-class brain tumor MRI dataset on Kaggle/IEEE
DataPort turns out to be a re-upload or recombination of the same two source
pools already in Phase 1's training data (Figshare Cheng2017 and Sartaj
Bhuvaji's dataset — masoudnickparvar aggregates both). This was checked
rigorously, not assumed: candidates were ruled out via exact split-size/
class-count fingerprint matches (e.g. `shreyag1103` shares masoudnickparvar's
exact 5712/1311 split) or by directly reading the candidate's own paper for
citations of the training-lineage datasets. **BRISC** (a 2026 *Scientific
Data* paper, initially promising) was ruled out this way — its own citation
list includes both `nickparvar2021brain` and `bhuvaji2021brain` directly.

No single dataset with real, independent institutional provenance covers all
4 classes together. The resolved design is a **composite of 4 separately-
sourced, single-class external sets**, each verified independent by actually
checking its paper/documentation for citations of the training lineage
(Figshare Cheng2017, Sartaj Bhuvaji, masoudnickparvar, BR35H, BraTS) rather
than assuming independence from absence of evidence:

| Class | Source | Provenance | Modality | Access |
|---|---|---|---|---|
| Glioma | **TCIA UPENN-GBM** (2026-08-19 — switched from REMBRANDT/UCSF-PDGM, neither of which is indexed in TCIA's scriptable API) | Real hospital-sourced, 630 patients, CC BY 4.0, fully open/`Authorized:1` | T1 pre/post-contrast, FLAIR, T2 (565 patients have T1-post) | `tcia_utils` (`nbia.getSeries`/`downloadSeries`), no gating |
| Meningioma | TCIA MENINGIOMA-SEG-CLASS | USC, 96 patients, pathology-confirmed | T1-CE (matches training) | **Gated**: requires the desktop NBIA Data Retriever tool + a manifest file; some series need NIH Controlled Data Access approval (facial-reconstruction risk policy) — no open scriptable alternative found in TCIA's index for meningioma specifically |
| Pituitary | **OpenNeuro `ds006248`** (2026-08-19 — switched from the Figshare Al-Mahfoudh dataset, which was 47.2GB in one zip, too large for available disk space) — "Open-access multiparametric MRI dataset of pituitary adenoma" (Černý, Májovský, Valošek et al., *Scientific Data*, under review) | Charles University / Military University Hospital Prague (UVN), 50 patients, 3T GE 750w scanner | COR CE-T1 (100% of patients), 3D AX T1+C (98%) — strong match to training modality | OpenNeuro (BIDS format, per-subject downloadable), 6.93GB total, CC BY-NC 4.0 |
| No-tumor | IXI Dataset | Hammersmith/Guy's/Institute of Psychiatry hospitals, London, ~600 healthy volunteers | T1 | brain-development.org, CC BY-SA (attribution required) — direct `.tar` links confirmed live; access method (plain HTTP vs. browser-only) still being verified |

**Honest limitations of this design, stated up front rather than discovered
later:**
- It's 4 independently-sourced single-class sets, not one unified external
  dataset — a deliberate, disclosed design choice, not a unified holdout.
- Meningioma's TCIA source (MENINGIOMA-SEG-CLASS) turned out to require
  dbGaP controlled-access approval restricted to "tenure-track professor or
  senior scientist" — a hard wall, not solvable with more effort. Resolved
  2026-08-21 via the BraTS Pre-operative Meningioma Dataset instead (Synapse
  `syn51514106`, freely self-serve accessible, 6-hospital IRB-approved
  cohort — independence verified by directly checking the paper's own
  citations, same rigor that ruled out BRISC).
- Pituitary and no-tumor sources are preprocessed NIfTI, not raw DICOM —
  needed format/resolution conversion to match the training preprocessing
  pipeline (224×224, grayscale-replicated-to-3ch, EfficientNet preprocessing).
- The no-tumor source (IXI) is community-recruited healthy volunteers, not
  patients clinically referred and found to have no tumor — a real, if minor,
  domain gap from what "no tumor" means in the training data's context.
- Small per-class sample sizes (50-100 patients per class) compared to
  Phase 1's training set — expected for genuinely independent clinical
  data, but means the external accuracy numbers have wider uncertainty than
  the in-distribution test set's, especially for the smaller classes.

**Result (2026-08-21, full detail in `docs/METRICS.md` and
`docs/DEVLOG.md`):** all 4 classes downloaded and evaluated. **68.45%
external accuracy vs. 94.42% in-distribution — a 25.97-point generalization
gap.** Per-class: pituitary 100% recall, no-tumor 99% recall, glioma 49%
recall, meningioma 41% recall. The high pituitary/no-tumor recall was
flagged by the user as a possible overfitting-shaped result rather than
taken at face value — checking confidence scores confirmed the concern:
the model is *more* confident (0.919) when wrongly predicting no-tumor for
a meningioma than when correctly predicting meningioma (0.845). A
follow-up MC-Dropout check found the uncertainty signal also degrades
under distribution shift (2.45x separation vs. 7.17x in-distribution) and,
for this specific failure mode, is likewise inverted — **the model's
learned bias toward "no tumor" as a default, and both its confidence
signals, fail together on exactly the same cases.** A calibrated asymmetric
decision-rule mitigation (require notumor to clear 0.90 probability before
winning outright) was implemented in `backend/ml_service.py` as a partial,
honestly-labeled mitigation — catches 34% of the missed tumors, does not
fix the underlying issue. Full calibration table in `docs/METRICS.md`.

**Properly-scoped next steps (not done this session, real future work,
not a quick add-on):**
1. **More/varied training data per tumor class.** The root cause is that
   training data for glioma/meningioma/pituitary comes from a single
   source pool (Figshare Cheng2017 + Sartaj Bhuvaji, both channeled through
   masoudnickparvar) — the model has limited exposure to real-world
   variation in scanner/protocol/presentation. This is the actual fix, not
   the decision-rule mitigation above. Scope: source additional
   independently-provenanced training-eligible data per class (distinct
   from the external-validation sources already used, to avoid
   train/validation contamination), verify leakage-safety the same way
   Phase 1's `check_duplicates.py` did, retrain, re-measure the
   generalization gap. Meaningfully larger scope than a single session —
   likely its own phase or sub-phase.

   **Sourcing research (2026-08-21/22): 3 of 4 classes have a viable
   source, meningioma does not — a real, documented gap, not a search
   failure.** Two research passes (a broad institutional-archive sweep,
   then a wider dig through Reddit/Papers With Code/GitHub/grand-challenge.org/
   recent 2023-2026 papers) both applied the same independence bar Phase 2c
   used: check each candidate's own paper/citations for overlap with the
   training lineage (Cheng2017/Bhuvaji/masoudnickparvar/BR35H) or the
   external-validation sources already spent (TCIA UPENN-GBM, BraTS-MEN via
   Synapse, OpenNeuro ds006248, IXI), not assumed from absence of evidence.

   | Class | Source | Patients | Modality | Access | Independence evidence |
   |---|---|---|---|---|---|
   | Glioma | **Dropped by scope decision** | — | — | — | See below. |
   | Pituitary | **"Mapping Pituitary Neuroendocrine Tumors"** (Figshare / *Scientific Data* 2025, National Hospital for Neurology and Neurosurgery, London) | 136 | T1w-CE (primary), T2w (majority) | Open, no account needed | Read the paper's full reference list directly — no citation of Cheng2017, Kaggle brain tumor dataset, masoudnickparvar, or OpenNeuro ds006248. **Merged into training 2026-08-23.** |
   | Notumor | **Dropped by scope decision** | — | — | — | See below. |
   | Meningioma | **None found** | — | — | — | See below. |

   **Scope decision (2026-08-23): public, no-institutional-hassle data
   only.** This is a personal student project, not a funded/institutional
   one — gated access (TCIA Restricted License review, BALSA/HCP,
   OASIS-3's institutional-email requirement) and accepting a real
   domain-shift risk to use technically-public-but-flawed data (OASIS-1)
   are both more hassle than the marginal training-data gain is worth.
   User decision: drop glioma and notumor sourcing entirely, keep only
   what was already cleanly obtained (pituitary), and treat the other two
   classes' data volume as a **documented permanent limitation** rather
   than a blocked task to revisit.

   **Glioma: CFB-GBM (TCIA) hit a real TCIA-side Faspex server bug** (500
   errors on both `browse` and `receive` against the CFB-GBM package,
   confirmed reproducible, not client-side) — see `docs/DEVLOG.md`'s
   2026-08-22 entry for the full Aspera/Ruby/firewall troubleshooting
   trail if this is ever revisited. The fallback, TCGA-GBM/TCGA-LGG,
   requires a human-reviewed TCIA Restricted License application —
   dropped by the scope decision above rather than pursued.

   **Notumor: HCP Young Adult confirmed a genuine dead end (2026-08-22).**
   HCP looked viable at first (887+ subjects, self-serve terms already
   accepted) but every documented access path turned out broken:
   ConnectomeDB was fully decommissioned into "ConnectomeDB powered by
   BALSA" (Sept/Oct 2025); BALSA's AWS-S3-credential button
   ("Get/Reset AWS S3 Access") 500-errors on every attempt; its Aspera
   download flow checks specifically for **IBM Aspera Connect**, which
   reached end-of-life in June 2026 and is no longer distributable
   anywhere (confirmed: the old CDN installer URL now 403s). The
   replacement product (IBM Aspera for desktop, installed and running
   during testing) doesn't satisfy BALSA's outdated browser-plugin
   detection check, so no client install on the user's end can work
   around it. All 3 of BALSA's documented paths independently confirmed
   broken — not user error, not a workaround-able gap.

   The fallback, **OASIS-1**, was confirmed genuinely open (2026-08-22,
   live HTTP 200 verified directly against `download.nrg.wustl.edu`'s
   static archives, no login/application needed) but was **dropped by
   the scope decision above (2026-08-23)** rather than pursued: it's
   1.5T/2007-era data with meaningfully different resolution/contrast/
   protocol than the 3T-era clinical tumor scans in the existing training
   data. Risk: the model learns a scanner-signature shortcut (field
   strength, slice thickness, skull-stripping artifacts) instead of
   genuine tumor-vs-no-tumor signal — the opposite of what sourcing more
   diverse data is meant to achieve, and not worth fighting with
   normalization/resolution-matching mitigations for a class that's
   already usable. **Notumor's training data stays unchanged.**

   **Meningioma: no viable source exists as of this research (2026-08-22).**
   Every candidate traced back to one of three dead ends, checked directly
   rather than assumed:
   - The Nature *Scientific Data* (2024) "multi-institutional meningioma
     MRI dataset" paper (PMC11096318) is not a new dataset — it *is* the
     data descriptor for the BraTS Pre-operative Meningioma Dataset
     (same 1,141-image count, same authorship), i.e. exactly the Synapse
     `syn51514106` set already spent on external validation.
   - **BRISC** (2025/2026, *Scientific Data*, 6,000 images) explicitly
     states in its own text that it derives from masoudnickparvar
     (Cheng2017 + Sartaj Bhuvaji + BR35H) — a re-annotation (added
     segmentation masks) of the existing training lineage, not new data.
   - **TCIA Meningioma-SEG-CLASS** (96 patients, University of Arkansas) —
     genuinely independent provenance, but as of July 2025 TCIA moved ALL
     controlled-access collections to a formal dbGaP/NCI Cancer Research
     Data Commons process requiring a signed Restricted License Agreement.
     This is the same class of hard wall Phase 2c already hit once for a
     different meningioma source (previously "tenure-track professor or
     senior scientist"-restricted) — the gate got *more* formal since,
     not less. Not pursued.
   - Two recent (2024-2026) papers with genuinely independent private
     clinical cohorts exist (Tianjin Huanhu Hospital, ~800 patients; a
     Xi'an Jiaotong-affiliated hospital cohort) but only their code is
     public (GitHub) — no data-availability statement, no download path,
     no evidence of even a formal request process. Not a viable source
     without direct author outreach, which was explicitly not pursued
     this pass (`AskUserQuestion` decision, 2026-08-22).

   **Decision (2026-08-22, user-confirmed):** proceed with the 3 viable
   classes (glioma/pituitary/notumor) now; leave meningioma's training
   data at its current volume rather than blocking the other 3 classes on
   an unsolved sourcing problem. This is a disclosed limitation, not a
   silent gap — meningioma is also the class with the worst external
   recall (41%) and the confidence-inversion failure mode the decision-rule
   mitigation partially addresses, so leaving its training data unchanged
   is a real, stated risk, not a neutral non-action.

   **Explicit re-check required after retraining (added specifically
   because of this asymmetry, not a generic "re-evaluate" note):**
   confirm whether adding more data to the other 3 classes makes
   meningioma's *relative* performance worse (e.g. if glioma/pituitary/
   notumor become easier to rule in/out, the model may lean harder into
   its existing meningioma→notumor default-bias) rather than just
   re-running the same external-validation script and reporting the
   headline number. Compare meningioma's post-retrain precision/recall AND
   its confidence-by-correctness numbers (the same calibration check that
   surfaced the original miscalibration finding) against the pre-retrain
   baseline in `docs/METRICS.md`, not just the aggregate accuracy.
2. **More external validation sources per class — researched 2026-08-23,
   not achievable within scope.** Two independent research passes (broad
   sweep, then a focused Zenodo/Mendeley/non-TCIA re-dig) looked for a
   second, independent, plain-download validation source per class.
   Result: **glioma** — nothing qualifies (BraTS re-uploads overlap
   UPENN-GBM's own lineage since UPenn-GBM contributed to BraTS; REMBRANDT/
   EGD/Zenodo candidates are gated or have unconfirmed independence).
   **Meningioma** — nothing; the one apparent lead (a "Vassantachart et
   al." TCIA collection) turned out, on direct verification, to be the
   exact same gated MENINGIOMA-SEG-CLASS collection already known and
   excluded (same collection page, same NIH Controlled Data Access
   Policy), not a separate dataset — a real near-miss worth flagging for
   any future search. **Pituitary** — the only candidate found (Figshare's
   "Mapping Pituitary Neuroendocrine Tumors") is the exact dataset already
   merged into this project's *training* set, so it can't double as a
   validation source. **Notumor** — nothing clean; NFBS Repository is a
   genuine plain-S3-download but shares lineage with the NKI-Rockland
   Sample, one of OpenBHB's aggregated constituents (same independence
   risk as OpenBHB itself); OASIS-1 showed conflicting access-requirement
   results between two separate checks (one confirmed live HTTP 200/no
   auth, a later one showed a "Request Access" gate) — not resolved,
   flagged rather than trusted either way. **Conclusion: not pursuing
   further** — this is a genuine dead end under the public/no-institutional-
   hassle constraint, not a gap to keep re-researching. Original framing
   below, kept for context:

   Current external numbers
   come from one source per class (50-100 patients each) — a real first
   measurement, but fragile: results could partly reflect quirks of each
   specific source (one institution/scanner/population) rather than the
   general external-validation story. Scope: repeat the sourcing-and-
   verification process (same rigor as this session — check each
   candidate's own citations, not just Kaggle re-uploads) to find a second
   independent source per class, re-run `eval_external_validation.py`
   against the expanded set, report whether the gap's magnitude changes
   or its direction holds.

### Phase 2d — Tool-calling agent for the chat assistant

**DONE (2026-08-23).** Built as planned below, with one deliberate
deviation: `get_uncertainty_details` takes `(entropy, level)` directly
rather than `(prediction_id)` — this app never had a prediction-persistence
layer (chat is stateless, given prediction/confidence/probabilities
per-request already), and inventing one just to satisfy a `prediction_id`
signature would have been scope creep for no real benefit; passing the
already-computed uncertainty values through achieves the same grounding.
The memory/context-management "action item" below (cache tool results per
`prediction_id`) was **not implemented** for the same reason - no
`prediction_id` exists to key a cache on, and re-invoking a cheap
local/hardcoded-lookup tool on every turn has no real cost worth
optimizing away here (unlike a slow/expensive external call). Full
results, before/after example, and files touched: `docs/DEVLOG.md`'s
2026-08-23 Phase 2d entry.

Context: user asked (2026-08-18) whether agent/tool-calling could genuinely fit
this project, given it's an increasingly common thing companies evaluate for.
Brainstormed against the same "real fit, not buzzword coverage" bar used for
RAG/MCP back in Phase 2b's original evaluation. General multi-step agentic
orchestration still doesn't fit a single-classifier app — no genuine multi-tool
workflow to orchestrate. But one narrow, real gap does exist and only exists
*because* Phase 1/2 are now done: **the chat assistant currently has no way to
ground its own answers about its own confidence in real data.** Today, if a user
asks "how sure are you about this?", `radiologist_chat` can only work from
whatever confidence number it was told in its prompt context — it can't verify,
recompute, or pull the actual MC-Dropout entropy/calibration numbers behind
that prediction. That's a real, current gap, not an invented one.

Plan: give the chat assistant 2-3 real callable tools instead of one blind LLM
call, and let it decide which to invoke based on the question asked:
1. **`get_uncertainty_details(prediction_id)`** — fetches this specific
   prediction's real MC-Dropout entropy/confidence numbers (Phase 2's output),
   so "how confident are you really?" triggers an actual data lookup instead of
   the LLM restating or paraphrasing a number from its prompt.
2. **Retrieval** (Phase 2b's grounded-RAG lookup) — becomes one tool among
   several instead of the only mechanism, so the model chooses to retrieve
   reference material only when the question calls for it.
3. **`get_external_validation_stats()`** (once Phase 2c ships) — grounds
   questions like "would this hold up on scans from a different hospital?" in
   the real measured generalization-gap numbers from Phase 2c, instead of the
   LLM guessing.

This is genuine tool-calling — the model is given a choice between distinct
tools and decides which (if any) to invoke per-question, not a single fixed
pipeline relabeled as "agentic." Explicitly not building: any broader
multi-step autonomous agent loop, since there's still no real multi-tool
workflow beyond grounding the chat's self-description of its own outputs.

Sequencing: after Phase 2 (needs real uncertainty numbers to be a genuine tool,
not a stub) and depends on Phase 2b for the retrieval tool — build after both,
or alongside 2b if the retrieval piece is ready first. Kept as its own phase
(not folded into 2b) so it's a distinct, nameable piece of work for the
interview narrative and resume, rather than blurred into the RAG phase.

**Evaluated against the 5 patterns typically cited as "production agentic AI"
(2026-08-19)** — tool use/function calling, reflection (generator/evaluator
self-critique loop), planning/task decomposition, orchestrator-worker
(multi-agent delegation), and memory/context management — since this is
increasingly what companies probe for and it's worth being able to explain
*why* something was or wasn't used, not just build whatever's trendy:

- **Tool use/function calling — genuine fit, this is Phase 2d itself.** No
  change from the plan above.
- **Reflection (generator produces, evaluator critiques/scores, loop until it
  passes) — not a fit, not building it.** There's no natural iterative output
  to refine here: the classifier emits one prediction per image, and having
  the LLM self-critique its own chat response or report risks manufacturing
  additional hallucination-on-hallucination rather than reducing it. No real
  loop exists for it to close.
- **Planning/task decomposition — not a fit, not building it.** This pattern
  exists for complex, multi-step, ambiguous user goals (e.g. "book me a
  trip"). A user's interaction here is single-turn: get a prediction, or ask
  one chat question. There's no complex goal to decompose into ordered
  subtasks.
- **Orchestrator-worker (multi-agent delegation) — not a fit, not building
  it.** This needs multiple genuinely distinct subtasks worth delegating to
  separately-scoped worker agents. Phase 2d's tool-calling is one agent
  choosing among a few tools per turn, which is not the same shape — forcing
  a multi-agent split here would mean inventing subtasks just to have workers
  for them, the same trap already rejected once for general agentic
  orchestration back in Phase 2b's original evaluation.
- **Memory/context management — narrow, real fit, folded into Phase 2d's
  design rather than a separate phase.** `radiologist_chat` already accepts
  `chat_history` across a multi-turn conversation. Once Phase 2d adds tool
  calls, deciding what stays in context across turns (e.g. don't re-run
  `get_uncertainty_details()` every follow-up message about the same
  prediction; remember which `prediction_id` the conversation is currently
  about) is a real, small-scale version of this problem — not long-running
  cross-session agent state, but genuine within-session context discipline.
  **Action item for Phase 2d's build**: cache/reuse tool results per
  `prediction_id` within a chat session instead of re-invoking a tool on every
  turn that references the same prediction.

Net: 2 of 5 patterns genuinely apply (tool use as the phase itself, memory/
context as a design detail within it); 3 don't fit this project's actual
shape and are deliberately not built. That evaluation — not the presence of
all five — is the interview-defensible position.

### Phase 3 — Interview narrative
Be ready to explain, not just demo:
- Why sensitivity was prioritized over specificity (or vice versa) and what that trade-off means clinically.
- What Grad-CAM does and doesn't prove.
- What would be needed for production-grade validation (radiologist-annotated masks, multi-reader studies).
- Why the model isn't validated for real hospital images out of the box (scanner/
  protocol/population distribution shift), what the external-validation numbers
  from Phase 2c actually showed, and how OOD/low-confidence flagging mitigates
  (not solves) that gap.
- Why the system doesn't continuously learn from user uploads, and what the
  legitimate alternative looks like: a designed (not necessarily built)
  human-in-the-loop pipeline — radiologist-confirmed labels accumulating toward
  periodic, re-validated retraining, consistent with how FDA-cleared models are
  actually versioned and updated.

### Phase 4 — Infra/DevOps (secondary, folded in opportunistically, free-tier only)

Context: got unsolicited tooling advice from two DeepHealth employees via LinkedIn —
a senior DevOps engineer (Puneet Sharma) listed GCP/AWS/Docker/K8s-orchestration/
CI-CD/Helm/ArgoCD/Octopus Deploy/service mesh; a full-stack dev (Jeevan Kumar) said
DeepHealth's stack includes Node/React/AWS/Firebase/SQL/Postgres, but explicitly
advised "don't need to know everything, master something you'll be proud of."

Decision: Jeevan's framing wins. Puneet's list describes a senior platform engineer's
*own* job, not a checklist for an AI/ML candidate — bolting on Helm/ArgoCD/service
mesh for a solo portfolio project would read as resume-padding, not competence. The
ML credibility gap (Phase 1/2) is the far bigger interview risk and takes priority.
This phase is explicitly secondary: worked on opportunistically alongside/after
Phase 1-2, not blocking them.

Scope, kept small and honest, **free-tier AWS only (no spend)**:
- **Docker**: already has `backend/Dockerfile`; harden/verify it properly (this part
  is not optional — it's already in the project).
- **EC2 free tier** (`t2.micro`/`t3.micro`, 750 hrs/month for 12 months on a new
  account) running the existing Docker container — chosen over ECS Fargate because
  Fargate has no meaningful free tier (billed per vCPU/memory-second from second one).
  Note: check TF-CPU + OpenCV memory footprint on 1GB RAM once a real model exists;
  t2.micro may OOM, t3.micro is the fallback (still free tier) before ever considering
  a paid instance.
- **S3 free tier** (5GB/12mo) to store the model artifact, loaded via boto3 at
  container startup — keeps the Docker image small and separates code from model
  weights, a real practice independent of cost.
- **ECR free tier** (500MB/12mo) for the container image.
- **One CI/CD tool only — GitHub Actions** (already on GitHub): build the Docker
  image and push to ECR on merge to main. Do not add a second CI/CD tool.
- Explicitly out of scope: GCP, Kubernetes/Helm/ArgoCD/Octopus Deploy, service mesh,
  RDS, load balancers, auto-scaling, Firebase — none needed for a single-user demo,
  all either non-free or over-engineered for this project's actual scale.
- Optional, only if a natural use case: replace the local-storage-based scan history
  (per README) with a real Postgres-backed history table — legitimate use case for
  SQL/Postgres exposure, not infra theater.

### Phase 5 — Frontend polish (dynamic UI, aesthetics)

Context: user wants the site to feel more dynamic and aesthetically pleasing
(animations, visual design), but explicitly does not want this to risk breaking
existing functionality.

Sequencing: after Phase 1, not now. Two reasons — (1) time/attention is better spent
on the thing an interviewer will actually probe first (is the model real, are the
metrics honest), and (2) polishing the UI around the current mock-model output means
re-polishing it again once Phase 1 changes what's actually displayed (real
confidence numbers, possibly uncertainty ranges from Phase 2). Doing it after Phase 1
avoids redundant work.

Approach when we get to it (to satisfy "don't break functionality"):
- Incremental changes only — styling, motion (Framer Motion is already a dependency),
  layout/visual-design passes — not touching data-fetching, state management, or API
  contracts between frontend and backend.
- Test each change against the running dev server (`npm run dev`) in-browser before
  moving to the next, rather than a large batch of changes landed at once.
- Frontend already has Framer Motion, Three.js/@react-three/fiber (3D brain viz),
  shadcn/ui, next-themes (light/dark toggle already implemented per recent commits) —
  polish should build on these existing choices, not introduce new UI libraries
  without reason.

### Cross-cutting: compliance and scalability (added 2026-07-05)

User wants the revamped project to be **HIPAA-aware** and **architecturally
scalable** — as real, proportional design decisions woven through every phase, not
separate bolt-on phases or theater.

**HIPAA-aware design practices** (not a compliance certification claim — a solo demo
app cannot be HIPAA-certified, but can be built with HIPAA principles in mind):
- No real PHI ever stored or logged. Uploaded scans are already temp-written and
  deleted after inference (`backend/main.py:52-54` `finally` block does this today —
  keep this pattern, extend it as new features are added).
- Explicit data-handling documentation: what's stored, for how long, where (e.g. if
  Phase 4's Postgres-backed history ships, document retention and whether it's
  opt-in).
- Keep the "assistive tool, not a diagnosis" disclaimer already present in
  `backend/llm_service.py` intact and consistent everywhere output reaches a user.
- Audit-trail-style logging of predictions (what was predicted, when, confidence) —
  without ever logging the image itself or any identifying data — as a lightweight,
  defensible practice.

**Code/architecture scalability** (design decisions and talking points, not literal
load testing or premature infra):
- Stateless backend request handling (already true — no session state in
  `backend/main.py`).
- Model loaded once at process startup as a singleton (already true —
  `ml_service.py:124`), not reloaded per-request — keep this pattern for any new
  model artifact.
- Clean separation of concerns as new pieces are added (data/training code, model
  serving, RAG retrieval, API layer) so components could scale independently later.
- Batch endpoint (`/api/predict/batch`) already exists — if revisited, process
  efficiently (e.g. avoid redundant model reloads, consider batched tensor inference
  rather than a Python loop calling `predict()` per image one at a time).

These are applied *within* Phases 1–5 above as each is implemented, not tracked as a
separate phase.

## Status
- [x] Phase 1: real trained model + metrics (2026-07-31 — EfficientNetB0
      fine-tuned, 94.42% held-out test accuracy, wired into backend/,
      mock VGGSKin.h5 retired. Remaining: Phase 3's narrative prose only.)
- [x] Phase 2: uncertainty quantification (2026-08-18 — MC-Dropout, 7.17x
      predictive-entropy separation between correct/incorrect predictions
      on the held-out test set, wired into backend/. Remaining: frontend
      display added same day.)
- [x] Phase 2b: grounded RAG for chat assistant (2026-08-18 — 4 real,
      sourced corpus documents [StatPearls/NCBI, RadiologyInfo.org],
      local-embedding + FAISS retrieval, wired into `radiologist_chat` with
      citation. Verified end-to-end. Along the way, found and fixed an
      unrelated break: Groq retired `llama-3.1-8b-instant`, swapped to
      `openai/gpt-oss-20b`.)
- [ ] Phase 2c: external-dataset validation done (2026-08-21 — composite
      4-class set, 68.45% external accuracy vs. 94.42% in-distribution,
      25.97-pt gap; a calibrated partial decision-rule mitigation for the
      notumor-default-bias failure mode shipped in `ml_service.py`). NOT
      done: broader OOD flagging beyond that one mitigation, and the two
      properly-scoped follow-ups (more/varied training data; more external
      validation sources per class) — see this file's Phase 2c section.
- [x] Phase 2d: tool-calling agent for the chat assistant. **DONE
      2026-08-23** (added 2026-08-18 — narrow, real fit: grounds the
      chat's answers about its own confidence/validation numbers via
      callable tools, not a general
      agent loop. Depended on Phase 2b [done] and Phase 2 [done] for its
      uncertainty/retrieval tools; benefited from, but didn't
      strictly require, Phase 2c.)
- [x] Phase 3: interview narrative write-up. **DONE 2026-08-23** —
      `docs/INTERVIEW_NARRATIVE.md`, full details in
      `docs/SCHEDULE.md`'s Phase 3 checklist.
- [x] Phase 4: Docker hardening + EC2/S3/ECR (free tier) + GitHub Actions
      CI. **DONE 2026-08-24** — real deploy, including a real OOM/lockup
      incident found and fixed live (see `docs/DEVLOG.md`). Full details
      in `docs/SCHEDULE.md`'s Phase 4 checklist.
- [~] Phase 5: frontend polish (dynamic UI, aesthetics) — after Phase 1.
      **In progress, started 2026-08-24** — real design-token fix
      (brand color), correctness fixes (stale VGG-16/fabricated metrics),
      2 new components. Not yet done: motion audit, regression pass,
      deploy. Full details in `docs/SCHEDULE.md`'s Phase 5 checklist.

See `docs/DEVLOG.md` for the chronological work log.
