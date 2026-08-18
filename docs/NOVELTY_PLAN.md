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

### Phase 2d — Tool-calling agent for the chat assistant

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
- [ ] Phase 2c: external-dataset validation + OOD/low-confidence flagging
- [ ] Phase 2d: tool-calling agent for the chat assistant (added
      2026-08-18 — narrow, real fit: grounds the chat's answers about its
      own confidence/validation numbers via callable tools, not a general
      agent loop. Depends on Phase 2b [done] and Phase 2 [done] for its
      uncertainty/retrieval tools — unblocked; benefits from, but doesn't
      strictly require, Phase 2c.)
- [ ] Phase 3: interview narrative write-up
- [ ] Phase 4: Docker hardening + EC2/S3/ECR (free tier) + GitHub Actions CI, opportunistic
- [ ] Phase 5: frontend polish (dynamic UI, aesthetics) — after Phase 1

See `docs/DEVLOG.md` for the chronological work log.
