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

### Phase 1 — Credibility (real model, real numbers)
- Train a real CNN / transfer-learning backbone (e.g. EfficientNet or ResNet) on an
  actual brain tumor MRI dataset (4 classes already implied: glioma, meningioma,
  pituitary, no tumor).
- Keep the training notebook/script in-repo.
- Report accuracy, precision/recall, per-class confusion matrix, on a proper held-out
  test set.
- Retire or clearly label the mock model; fix the `VGGSkin` naming.

**Decisions locked in (2026-07-05, planning only — no code written yet):**
- **Dataset**: Kaggle "Brain Tumor MRI Dataset" (masoudnickparvar) — ~7000 images,
  4 classes matching the existing labels exactly (Glioma, Meningioma, No Tumor,
  Pituitary). Chosen over an unspecified/custom source for direct citability in the
  writeup and exact label compatibility with the existing app.
- **Compute**: user has a local GPU — RTX 2050 (4GB VRAM laptop GPU) + Ryzen
  5000-series CPU. Training will run locally on this GPU, not Colab.
- **Architecture**: EfficientNetB0, ImageNet-pretrained, transfer learning, at
  224×224 input, batch size 16–32. Rationale: EfficientNetB0 (~5.3M params)
  comfortably fits 4GB VRAM at this batch size; a larger backbone (ResNet50,
  EfficientNetB3+) risks OOM or forces impractically small batches on this GPU.
  It's also a legitimate, modern, defensible choice to discuss in an interview
  (accuracy/efficiency tradeoff), not just "biggest model available."
- **Train/serve consistency**: model will be exported to a format servable by the
  existing `tensorflow-cpu` backend dependency in `backend/requirements.txt` — no
  architecture or environment mismatch between training and the FastAPI serving
  path.
- Nothing has been implemented yet — dataset download, training script, and
  everything downstream are still pending and require explicit go-ahead.

### Phase 2 — The actual novelty (pick one, do it rigorously)
Leading candidate: **calibrated uncertainty quantification** (MC-dropout or conformal
prediction) surfaced in the UI as a confidence interval, not a bare softmax number.
Rationale: raw softmax confidence is known to be overconfident/miscalibrated; this is
exactly the kind of judgment a clinical-risk-aware company probes for.

Secondary candidate: validate Grad-CAM against real localization (masks/bounding boxes
if available) or explicitly discuss its failure modes in the write-up.

### Phase 2b — Grounded RAG for the chat assistant

Context: evaluated where RAG, MCP servers, and agentic AI could genuinely fit this
project (as opposed to being added for buzzword coverage). Conclusion: MCP has no
natural consumer here (would mean inventing a use case, skip entirely) and true
agentic multi-tool orchestration doesn't fit a single-classifier app either. RAG is
the one with a real, defensible use case.

Problem it fixes: `backend/llm_service.py:66` (`radiologist_chat`) currently answers
medical questions purely from Llama-3.1's parametric knowledge — ungrounded, no
citation, real hallucination risk for a "Dr. NeuralPath" persona making claims about
brain tumor conditions.

Plan: ground the chat in a small curated medical reference corpus (e.g. WHO CNS
tumor classification excerpts, public radiology reference text on glioma/
meningioma/pituitary presentation) via a lightweight retriever (embeddings +
FAISS/Chroma), and have the assistant cite/base answers on retrieved passages
instead of relying on the model "just knowing." This is a natural interview talking
point about hallucination risk in clinical LLM applications — a real concern for a
health-AI company — not decoration.

Sequencing: after Phase 1/2, since it improves the LLM layer, not the classifier
credibility gap that Phase 1 fixes first.

### Phase 3 — Interview narrative
Be ready to explain, not just demo:
- Why sensitivity was prioritized over specificity (or vice versa) and what that trade-off means clinically.
- What Grad-CAM does and doesn't prove.
- What would be needed for production-grade validation (radiologist-annotated masks, multi-reader studies).

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
- [ ] Phase 1: real trained model + metrics
- [ ] Phase 2: uncertainty quantification
- [ ] Phase 2b: grounded RAG for chat assistant
- [ ] Phase 3: interview narrative write-up
- [ ] Phase 4: Docker hardening + EC2/S3/ECR (free tier) + GitHub Actions CI, opportunistic
- [ ] Phase 5: frontend polish (dynamic UI, aesthetics) — after Phase 1

See `docs/DEVLOG.md` for the chronological work log.
