# Dev Log — NeuralPath AI

Chronological record of work done on this project as part of the DeepHealth AI interview
prep effort. Newest entries at the top. See `docs/NOVELTY_PLAN.md` for the overall plan
and rationale.

---

## 2026-08-24 — Phase 4: real AWS deploy, a real OOM incident found and fixed live

**Built:** fixed the known Dockerfile Python-version conflict (was already
`python:3.10-slim` by this session — an earlier fix, confirmed working),
added non-root `USER appuser` hardening, added S3-backed model-weight
loading (`_ensure_weights_local()` in `ml_service.py`, downloads via
`boto3` if `MODEL_S3_BUCKET` is set, no-op otherwise so local dev is
unaffected) so a retrained model can be redeployed by uploading a new S3
object + restarting the container, without rebuilding the image.

**Real AWS resources created** (account 148274106033, ap-south-1, user
confirmed before creating anything billable): S3 bucket
`neuralpath-ai-model-<account>` (public access blocked, model weights
uploaded), ECR repo `neuralpath-backend`, IAM role + instance profile with
scoped S3-read/ECR-read/SSM-read policies (no admin/wildcard permissions),
SSM Parameter Store SecureString for `GROQ_API_KEY` (never embedded in
user-data or the image in plaintext - user explicitly approved the one
command that wrote it, since the auto-mode classifier correctly flagged
secret-writing as needing confirmation), security group (SSH restricted to
the caller's own IP /32, not 0.0.0.0/0; API port 8000 public), EC2
t3.micro (free tier) running the container via a user-data bootstrap
script.

**A real, measured OOM/lockup incident, found on literally the first real
test - not a hypothetical, not skipped:** built the image first at
3.45GB (fixed to 907MB by pinning `torch` to PyTorch's CPU-only wheel
index - `sentence-transformers` had transitively pulled full CUDA wheels,
totally wasted weight on CPU-only infra), smoke-tested locally (measured
~570MB RAM usage per prediction - already flagged as tight for a 1GB
t3.micro), got explicit user sign-off to accept that risk on cost grounds,
deployed - and the first real prediction request against the live
instance **locked up the entire instance**: SSH and even the lightweight
`/health` endpoint both stopped responding for several minutes, while
AWS's own instance/system status checks stayed "ok" throughout (confirming
in-guest resource exhaustion, not an AWS-side failure - a genuinely useful
diagnostic distinction). Diagnosed for real once the instance was rebooted
and reachable again: SSH in, `free -h` showed 58MB free, 0 swap configured.
Fixed with 3 changes: made `MC_DROPOUT_PASSES` an env-configurable override
(deployed at 10, not the locally-validated 30 - a disclosed trade-off, not
silent), added a 1GB swap file (free, EBS-backed safety net), and ran the
container with a hard 700MB Docker memory limit so a future spike gets
OOM-killed-and-restarted instead of taking the whole instance down again.
Re-tested: 2 consecutive real predictions succeeded (6.1s cold, 3.8s warm),
peak 522.8MB/700MB, no lockup.

**GitHub Actions CI added** (`.github/workflows/deploy-backend.yml`):
builds `backend/Dockerfile` and pushes to ECR on push to `backend/**` on
main. Deliberately does NOT auto-deploy to the running EC2 instance -
redeploying (pull + restart) stays a manual SSH step, since this is one
manually-managed instance with no rollback safety net, not a fleet behind
a load balancer. Needs `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` GitHub
repo secrets added by the user (cannot be set by an agent - GitHub's own
secret store, gated behind the user's own repo auth) before it can
actually run.

Full numbers: `docs/METRICS.md`'s "Infra / deployment (Phase 4)" section.

**Not done, explicitly out of scope for this pass**: batch endpoint
latency, concurrent-load/p95/p99 testing (this session's re-test was
sequential single requests only, consistent with the existing "not yet
measured" note in `docs/METRICS.md`'s Inference latency section),
Postgres-backed scan history (checklist item 9, marked optional/only if
it comes up naturally - didn't).

**Follow-up same day: HTTPS added, and a real frontend-connection bug
found and fixed.** The deployed backend was plain HTTP; the Vercel
frontend serves over HTTPS, so a direct connection would have hit
browser mixed-content blocking. Fixed by installing nginx + certbot on
the EC2 instance and issuing a real Let's Encrypt certificate for
`65-2-123-222.nip.io` (a free wildcard-IP-encoding DNS service - no
domain purchase needed; resolves to the instance's own IP). Verified via
a direct HTTPS request plus a CORS preflight check against the Vercel
origin before trusting it.

Connected the Vercel frontend's `NEXT_PUBLIC_API_URL` to this HTTPS
endpoint - and hit a real, non-obvious bug: the user had marked the env
var "Sensitive" in Vercel's UI, which hides/encrypts it in a way that
appears to prevent it from being inlined into the client bundle at build
time (the way `NEXT_PUBLIC_*` vars are supposed to work - they're meant
to be plainly embedded in the shipped JS, not kept server-side-only).
Symptom was confusing: the live predict page returned a *wrong but
plausible-looking* result (misclassified a genuinely-pituitary test image
as meningioma) rather than an obvious connection error, which briefly
looked like a real model regression - ruled that out by checksumming the
deployed model's weights file (matched the correct, current, retrained
model exactly) and testing the exact same image directly against the
AWS backend via curl (correctly returned Pituitary Tumor, 99.8%
confidence, low uncertainty) - confirming the bug was in the frontend's
connection, not the model. Fixed by deleting and recreating the env var
with the Sensitive toggle off, then redeploying. Verified working via a
second live test.

**A real lesson for anyone hitting this again**: don't mark `NEXT_PUBLIC_*`
env vars as "Sensitive" in Vercel - they need to be readable at build
time to serve their actual purpose (client-side config), and marking one
sensitive can silently break that without a clear error message anywhere
in the build log, server logs, or browser console (this project's
DevTools Console showed zero errors related to it - only an unrelated
Clerk dev-key warning).

---

## 2026-08-23 (continued, 2) — Phase 2d done: tool-calling chat assistant

Implemented per `docs/SCHEDULE.md`'s Phase 2d checklist. 3 tools, LLM
decides which (if any) to call per message via `ChatGroq.bind_tools()`:
- `get_uncertainty_details(entropy, level)` — explains a scan's real
  MC-Dropout entropy against this model's actual calibration (correct
  predictions average ~0.077 entropy, incorrect ~0.554, from
  `mc_dropout_eval.py`'s held-out run).
- `retrieve_medical_reference(query)` — Phase 2b's retriever, reused as a
  tool instead of always running on every message (the prior behavior).
- `get_external_validation_stats()` — this model's real, measured
  72.83% external / 94.88% in-distribution / 21.59pt gap numbers (today's
  retrain), as a hardcoded snapshot (the eval script runs offline, nothing
  the deployed backend can query live — same reasoning as why
  `docs/METRICS.md` is a snapshot, not a dashboard).

No `prediction_id`/persistence layer was invented for the uncertainty
tool — this app's chat was already stateless (prediction/confidence/
probabilities passed per-request), so `uncertainty` (already computed at
predict time) is threaded through the same way and handed to the tool as
real arguments.

**Tested against the exact 3 question types the checklist named, verified
by inspecting which tool actually got called, not just that a plausible
answer came back:**
- "how confident are you really about this result?" → `get_uncertainty_
  details` fired, entropy=0.741 real value used.
- "is this consistent with known meningioma presentation on MRI?" →
  `retrieve_medical_reference` fired, cited StatPearls.
- "would this hold up on a different hospital's scans?" →
  `get_external_validation_stats` fired, cited 72.8%/94.9%/51%.
- "thank you, that helps" → correctly called no tools.

**Real before/after example** (the actual interview evidence, not just
"we added function calling"), same question ("how confident are you
really about this result?"), same scan context (meningioma, 90.4%
confidence):

*Before (no tools, same system prompt minus the tool instructions)*: a
long, well-formatted answer about what a 90.4% softmax score means in the
abstract — probability theory, generic caveats about "population bias"
and "image quality," a table. Sounds credible. **Never touches this
model's actual measured uncertainty** (MC-Dropout entropy 0.741, which
this scan genuinely has) or the real correct/incorrect entropy thresholds
this model was calibrated against — the caveats it raises (population
bias, image quality) are plausible-sounding but not things this project
has actually measured or can support.

*After (tool-calling)*: "The model's uncertainty for this case is high
(entropy=0.741). On the test data the model usually has an entropy
around 0.08 for correct calls, while incorrect calls average around
0.55 — so 0.74 is in the range more often seen when the model is wrong."
Grounded in this specific scan's real number and this specific model's
real calibration data, not generic reasoning about softmax scores.

**Files touched**: `backend/llm_service.py` (rewritten `radiologist_chat`,
added 3 `@tool`-decorated functions), `backend/main.py` (`/api/chat`
accepts `uncertainty`), `frontend/src/app/predict/page.tsx` (passes
`result.uncertainty` through to the chat call).

---

## 2026-08-23 (continued) — Retrained on merged pituitary data: found and fixed a real regression, ended up beating the original baseline

**Retrained** (`train.py` frozen-base → `finetune.py`) on the manifest
rebuilt after merging 199 new pituitary slices. First result was bad:
external accuracy **regressed** 68.45% → 65.11% (generalization gap
widened 25.97 → 29.31 pts), with glioma recall collapsing to 22% and
pituitary precision to 42% — the model was calling real external glioma
cases "pituitary" 209/300 times.

**Root-caused it properly instead of reverting blind.** Visually compared
sample images from the new source against the existing training data
(`Tr-pi_1.jpg` vs. `ExtraTr-pi_10_slice1.jpg`, read directly, not
inferred): the existing pituitary training images are coronal/sagittal
close-ups; every new sourced image was **axial**, wide field of view,
eye-sockets-and-skull-base visible. `download_pituitary_extra_train.py`
had picked the slicing axis via `argmin(shape)`, which for this dataset's
near-isotropic 0.5mm volumes happens to select axial. The model learned
"axial wide-field skull-base" as a spurious pituitary shortcut, which then
misfired against external glioma (also shot axially). Also found a
secondary issue: the new slices were non-square (~499×419 vs. the
existing 512×512), which `tf.image.resize` would stretch non-uniformly.

**Fix**: hardcoded the coronal axis (verified by extracting and visually
checking mid-slices along all 3 axes of one volume first, not assumed)
and added a center-crop-to-square step before saving. Re-extracted from
the already-downloaded zip (no re-download needed), re-merged (192 old
axial slices removed, 199 new coronal slices added — 1400→1599 total
pituitary images), rebuilt the manifest, retrained from scratch.

**Result: a genuine improvement over the ORIGINAL (pre-merge) baseline,
not just a recovery from the regression:**
- Held-out test accuracy: 94.42% → **94.88%**
- External accuracy (with decision rule): 68.45% → **72.83%** (+4.38 pts)
- Generalization gap: 25.97 → **21.59 pts** (−4.38 pts)
- Glioma recall (external): 49% → 55%; pituitary precision: 81% → 67% (a
  real trade-off — pituitary's external precision dipped as its recall
  hit 100%, but glioma's confusion-into-pituitary is now much rarer)
- Meningioma (training data unchanged) — checked as required: held-out
  test precision/recall both within ~2pts of before, no relative harm.
  External meningioma recall dipped slightly (57%→51%, more confusion
  with notumor) — a real, disclosed trade-off, not hidden.

Backend serving checkpoint (`backend/model/brain_mri_efficientnetb0.
weights.h5`) updated to this model; the two prior versions (original
baseline, and the bad axial-merge version) are both backed up alongside
it (`.pre_pituitary_merge_backup`, `.pre_coronal_fix_backup`) for
comparison/rollback if ever needed. Full numbers in `docs/METRICS.md`'s
new "Retrain with additional pituitary training data" section.

**Lesson logged for future sourcing scripts**: verify a new source's
imaging plane/orientation matches the existing training distribution
before merging — this doesn't show up in file counts or even in
per-class training-distribution accuracy, only in cross-class confusion
on external/held-out data.

---

## 2026-08-23 — Phase 2c follow-up #2 closed out: scope narrowed to public-only data, pituitary merged into training

**Decision:** user reframed the goal explicitly — this is a personal
student project, not worth chasing institutional/gated access for. Public,
no-application data only. Concretely:
- **Glioma sourcing dropped entirely.** CFB-GBM died to a real TCIA-side
  Faspex bug (see yesterday's entry); its fallback, TCGA-GBM/TCGA-LGG,
  needs a human-reviewed TCIA Restricted License application — dropped,
  not pursued. `docs/tcia_restricted_license_exhibit_a_draft.md` deleted.
- **Notumor's OASIS-1 fallback dropped too**, despite being genuinely
  public/no-application — its 1.5T/2007 domain-shift risk against
  presumably-3T training data wasn't worth fighting with mitigations for
  a student project. Scratch download (`_scratch_oasis1/disc1.tar.gz`)
  deleted.
- **Pituitary merged into training**, since it was already fully and
  cleanly sourced: 192 slices converted PNG→JPEG (`data_pipeline.py`'s
  `tf.io.decode_jpeg` needs JPEG, not PNG) and copied into
  `DATASET_DIR/Training/pituitary/` as `ExtraTr-pi_*.jpg` (1400 → 1592
  files, provenance kept visible via the prefix). Re-ran `build_split.py`
  to regenerate the leakage-safe manifest — its existing perceptual-hash
  clustering handles the leakage check automatically, no separate
  verification step was needed. Result: 7392 total files (up from 7200),
  clean split with no cross-boundary duplicates:
  - train 5176 (pituitary 1399, up from ~1225), val 1099 (pituitary 296),
    test 1117 (pituitary 297); glioma/meningioma/notumor counts unchanged.

**Net result:** 1 of 4 classes (pituitary) got new training data; glioma,
meningioma, and notumor's training volume is unchanged and now documented
as a **permanent limitation** (not a pending task) — public data covering
those 3 classes independently of the existing training lineage does not
exist, or exists only behind gates this project has deliberately chosen
not to pursue. This asymmetry (one class improved, three static) needs to
be called out explicitly in any write-up of this work, and is exactly why
the next retrain's re-measurement must check per-class relative
performance, not just aggregate accuracy — see `docs/SCHEDULE.md` item 10.

**Not yet done:** retrain on the updated manifest, re-measure the
generalization gap (including the meningioma/notumor-specific check).

---

## 2026-08-22 — Phase 2c follow-up #2 (more training data): sourcing started, 1 of 4 classes done, 1 real dead end, 1 pivot in progress

**Context:** Continuing item #10 from Phase 2c's follow-ups — sourcing
additional independently-provenanced training data per class (distinct
from the external-validation sources, to avoid contaminating that
measurement). Two research passes identified candidates: CFB-GBM
(glioma), a Figshare pituitary NET dataset (pituitary), HCP Young Adult
(notumor); meningioma confirmed to have no viable source (dbGaP-gated or
already spent).

**Pituitary: done.** Downloaded the Figshare "Mapping Pituitary
Neuroendocrine Tumors" dataset (`download_pituitary_extra_train.py`) —
192 mask-guided slices from 64 patients, visually verified correct
orientation. The ~44GB download hit two real mid-transfer failures
(silent process death, no traceback — looked like a network/host
connection drop) before the script got real HTTP Range-header resume +
retry logic added; also one silent extraction-phase failure, fixed by a
plain re-run since the zip was already complete. Real lesson for future
large downloads in this project: don't trust a single unretried HTTP
stream for anything multi-GB.

**Glioma: blocked on a TCIA-side bug, pivoted to a gated fallback.**
CFB-GBM turned out to be NIfTI-only (not DICOM), requiring the Aspera
Faspex5 path — got the full toolchain working (Ruby, `aspera-cli`, `ascp`
binary, a Windows Firewall allow-rule for `ruby.exe`, an IPv4-forcing
Ruby patch for a separate IPv6-resolution issue) only to find TCIA's own
Faspex server 500-errors on both `browse` and `receive` against this
specific package folder — confirmed reproducible, a real bug on TCIA's
end, not fixable from here. Switched to TCGA-GBM/TCGA-LGG, which needs a
signed TCIA Restricted License Agreement (real human-reviewed
application, not instant). Drafted the Exhibit A project-justification
text and field checklist for the user
(`docs/tcia_restricted_license_exhibit_a_draft.md`) — submission and
approval are the user's to do, status unknown as of this entry.

**Notumor: HCP Young Adult confirmed a total dead end, pivoted to
OASIS-1.** This took the most churn of the session. ConnectomeDB (the
platform the earlier HCP research was based on) turned out to have been
fully decommissioned into "ConnectomeDB powered by BALSA" sometime in
Sept/Oct 2025 — not documented anywhere obvious, discovered only because
`db.humanconnectome.org` kept silently redirecting to BALSA. From there,
every one of BALSA's three documented access paths failed independently:
the "Get/Reset AWS S3 Access" button 500-errors every time; the Aspera
download flow's plugin-detection popup checks specifically for **IBM
Aspera Connect**, which turned out to have reached end-of-life in June
2026 (confirmed: its old CDN installer URL now 403s, and IBM's own EOL
notice states it) — so the popup is asking users to install a product
that no longer exists. Installing the actual current replacement (IBM
Aspera for desktop) didn't help, because that product deliberately
doesn't use the old browser-plugin handshake BALSA's detection is still
checking for. Confirmed via direct back-and-forth troubleshooting with
the user (checking the app was actually running, retrying the download
button, dismissing the popup without following its broken link) that
nothing on the client side can satisfy BALSA's check — this is a real,
independently-confirmed-broken integration on their end, not user error
or an environment problem. Logged in `docs/SCHEDULE.md`/`NOVELTY_PLAN.md`
specifically so a future session doesn't waste time re-attempting it.

Pivoted to OASIS. OASIS-3 (755 cognitively normal subjects, genuinely
scriptable via `NrgXnat/oasis-scripts`, confirmed still working) requires
an institutional email on its application form — Gmail/Yahoo explicitly
rejected — which the user doesn't have, with documented rejections for
exactly this kind of applicant. Checked OASIS-1 instead: confirmed
genuinely open via a live, unauthenticated HTTP 200 against
`download.nrg.wustl.edu`'s static archives — no login, no application.
~316 usable nondemented subjects, no lineage overlap with existing
training data. But it's 1.5T, 2007-era data with real resolution/contrast
differences from the training set's typical 3T-era clinical scans — a
genuine domain-shift risk (the model could learn a scanner-signature
shortcut rather than real tumor-vs-no-tumor signal) that needs a decision
before downloading anything. Not resolved this session.

**Net result of this session's item #10 work:** pituitary done (1 of 4),
glioma pending the user's TCIA application (1 of 4), notumor at a
scope decision point on OASIS-1's domain-shift risk (1 of 4), meningioma
confirmed unsolvable (1 of 4, unchanged from the prior session's finding).

---

## 2026-08-21 — Phase 2c: composite external-validation set built + evaluated; data storage migrated to external HDD

**Context:** Continuing Phase 2c (external validation + OOD flagging). Also,
mid-session, the external HDD became available again - migrated data
storage per the original plan, but with real drive-speed testing first
rather than assuming.

**External-validation sourcing (the hard part):** every 4-class Kaggle/IEEE
DataPort candidate investigated (7 total, including BRISC, a 2026 peer-
reviewed dataset that looked independent until its own citation list was
checked directly) turned out to be a repackaging of the same Figshare
Cheng2017/Sartaj Bhuvaji/masoudnickparvar pool used in Phase 1 training.
TCIA's MENINGIOMA-SEG-CLASS looked like a real independent option but
requires dbGaP controlled-access approval restricted to "tenure-track
professor or senior scientist" - a hard wall for a personal project, not
solvable with more effort. Resolved as a **composite of 4 separately-
sourced, single-class collections**, each verified independent by actually
reading the source's own paper/citations, not assuming from absence of
evidence: TCIA UPENN-GBM (glioma), BraTS Meningioma via Synapse
(meningioma), IXI (no-tumor, via a GitHub Releases mirror since the
original brain-development.org host 403s scripted requests), OpenNeuro
`ds006248` (pituitary). Full detail in `docs/NOVELTY_PLAN.md`'s Phase 2c
section.

**Real bugs hit and fixed during slice extraction** (each is a real,
non-obvious lesson, not just "it worked eventually"):
- IXI/OpenNeuro NIfTI volumes have oblique (non-axis-aligned) affines - a
  naive `data[:,:,mid]` slice produced a near-sagittal view, not axial.
  Fixed via `nibabel.as_closest_canonical()` reorientation.
- A first meningioma attempt used the BraTS *validation* zip and picked
  slices at fixed volume fractions (no ground-truth mask available in that
  zip - masks are withheld for the challenge). Result: many slices didn't
  show the tumor at all, artificially crashing meningioma's measured
  accuracy for a reason unrelated to real generalization. Fixed by
  downloading the 20.2GB *training* zip instead (which does have
  `-seg.nii.gz` masks) and picking the slice with the most tumor-labeled
  voxels per patient - same rigor as the pituitary class's mask-guided
  selection.
- `synapseclient` pulls in a protobuf version that hard-breaks TensorFlow
  2.10 if installed in the same environment - confirmed by testing (not
  assumed). Fixed by giving it its own throwaway venv, kept separate from
  `training_env` permanently.

**Evaluation result (`eval_external_validation.py`, `eval_external_mc_dropout.py`):**
68.45% external accuracy vs. 94.42% in-distribution - a 25.97-point
generalization gap. Per-class: pituitary 100% recall, no-tumor 99% recall,
glioma 49% recall, meningioma 41% recall. User caught something the raw
accuracy numbers alone would have hidden: pituitary/no-tumor's near-perfect
recall could reflect overfitting-flavored bias rather than genuine skill.
Checking confidence scores confirmed this concern was well-founded and
surfaced something worse than expected - the model is *more* confident
(0.919) when wrongly predicting no-tumor for a meningioma than when
correctly predicting meningioma (0.845). A follow-up MC-Dropout check on
the same external set found the uncertainty signal partially degrades under
distribution shift (2.45x entropy separation vs. 7.17x in-distribution) and,
for this specific failure mode, is *also* inverted (lower entropy on the
meningioma→no-tumor errors than on correct meningioma predictions) - MC-
Dropout is not a reliable safety net for this particular, clinically
costly error type. Full numbers and per-class breakdowns in
`docs/METRICS.md`.

**Plain-language read (for the interview narrative, Phase 3):** this is a
real, reportable finding, not a failure to hide. The model has learned to
lean on "no tumor" as a default when it's out of its depth on external data
- and it does so *confidently*, which both the raw softmax and the MC-
Dropout uncertainty signal fail to flag for this specific case. The honest
mitigations, not yet built: (1) more/varied training data per class -
current tumor classes are single-institution both in training (Kaggle's
Figshare/Sartaj pool) and in this external check, so the model has limited
exposure to the range of real presentations; (2) a decision rule that
doesn't just take the argmax class - e.g. requiring the no-tumor class to
clear a *higher* confidence bar than tumor classes before committing to it,
given the asymmetric cost of a missed tumor vs. a false alarm; (3) more
external validation sources per class (current external samples are
50-100 patients from one source each, genuinely small) before trusting
this gap's exact magnitude rather than its direction.

**Data storage migration (mid-session, external HDD reattached):**
confirmed via `Get-PhysicalDisk` that `D:\NeuralPath-AI-data\` is a real
USB-connected HDD (WD Elements 2621, MediaType: HDD, ~6 MB/s real
small-file throughput - an earlier same-session PowerShell benchmark
showing ~2900 reads/sec was a Windows write-cache artifact, not real disk
speed). Split storage: `dataset/` and `external_validation/` (read-heavy,
rarely rewritten) moved to D:; `checkpoints/` and `split_manifest.csv`
(actively written during training) kept on C:'s NVMe SSD. `paths.py` now
has two roots (`DATA_ROOT`, `FAST_DATA_ROOT`) instead of one.
`split_manifest.csv` was regenerated (not just moved) since it stores
absolute filepaths. Verified via checksums + robocopy's integrity report
before deleting the C: originals.

**Not yet done for Phase 2c**: OOD/low-confidence flagging implementation
in `ml_service.py`'s `predict()` (checklist items 6-9 in `docs/SCHEDULE.md`)
- given this session's finding that a simple entropy threshold won't catch
the meningioma failure mode, the flagging design needs to account for that
rather than just wiring in the existing signal as originally scoped.

---

## 2026-08-18 (final) — Phase 2b done: grounded RAG wired into the chat assistant; unrelated Groq model retirement fixed along the way

**Context:** Continuing straight from the ledger/task-count work into Phase
2b (the next unstarted phase). `radiologist_chat` currently answers medical
questions purely from Llama's parametric knowledge with no citation - a
real hallucination-risk gap for a "Dr. NeuralPath" persona.

**Did:**
- User explicitly asked to source real reference material rather than have
  me write plausible-sounding medical text from memory - doing the latter
  would have reproduced the exact ungrounded-hallucination problem this
  phase exists to fix. Researched and fetched 4 real, citable, freely
  accessible sources: StatPearls (NCBI Bookshelf, National Library of
  Medicine/NIH) articles on gliomas, meningioma, and pituitary adenoma, plus
  a RadiologyInfo.org (jointly produced by RSNA and ACR) article on reading
  normal/negative brain MRI reports for the no-tumor class. Saved as
  `backend/rag_corpus/*.md`, each with YAML frontmatter recording the real
  source URL and retrieval date.
- Decided embedding source and vector store deliberately rather than
  defaulting: local `sentence-transformers` (`all-MiniLM-L6-v2`) over an
  OpenAI embeddings API - no new paid dependency, consistent with this
  project's free-tier-only posture (Phase 4 AWS is explicitly free-tier).
  FAISS over Chroma - lighter, no persistence server needed for a corpus
  this small.
- Wrote `backend/build_rag_index.py`: chunks each corpus doc by markdown
  heading (22 chunks total, naturally topic-coherent sections rather than
  arbitrary fixed-size splits), embeds, builds a FAISS `IndexFlatIP` index
  (cosine similarity via normalized vectors).
- Wrote `backend/retriever.py`: singleton retriever loaded once (same
  pattern as `ml_service.py`'s model singleton), `retrieve(query, top_k,
  min_score)`. Calibrated `min_score` empirically rather than guessing -
  checked the actual score distribution: clearly irrelevant queries ("what
  is the capital of France") scored 0.06-0.07, genuinely relevant ones
  0.49-0.75. Settled on 0.35.
- Modified `backend/llm_service.py`'s `radiologist_chat`: retrieves top-3
  passages per message, includes them in the system prompt as explicit
  reference material with an instruction to cite the source and defer to it
  over the model's own guesses. Empty retrieval (nothing clears the
  threshold) is handled as a valid outcome, not an error - the chat still
  answers, just ungrounded for that specific message.
- **Hit an unrelated but real bug while testing end-to-end**: Groq has
  fully retired `llama-3.1-8b-instant` (confirmed via the Groq models API -
  it's not in the current model list at all), which broke both
  `radiologist_chat` and `generate_medical_report` - a pre-existing issue
  that happened to surface now, not something Phase 2b introduced. Fixed by
  swapping both to `openai/gpt-oss-20b` after checking the actual list of
  currently-available Groq models rather than guessing a replacement name.
- Verified end-to-end against a running server: a meningioma-specific
  question ("what is a dural tail sign") correctly retrieved and cited the
  meningioma corpus passage; "what is the capital of France?" correctly
  retrieved nothing; a fully off-topic chat message ("what should I eat for
  breakfast") correctly redirected without fabricating a citation.
- Captured a genuine before/after example (same question, ungrounded
  pre-Phase-2b prompt vs. grounded): **honest finding, not oversold** - both
  answers were factually correct, since dural tail signs are well-known
  medical knowledge already in the base model's training data. The real,
  demonstrable difference is citability: the grounded answer explicitly
  cites "StatPearls, 'Imaging Characteristics'"; the ungrounded one presents
  the same facts with no traceable source. Documented this distinction
  carefully in `docs/METRICS.md` rather than claiming the ungrounded model
  got something wrong, which it didn't in this test.
- **Also found and documented a real limitation, not hidden**: embedding
  similarity alone can't perfectly distinguish "how confident is the model
  about its own output" from "confidence" as a medical term - "how
  confident are you really about this diagnosis?" still retrieves medical
  passages at ~0.49 similarity, above threshold. This is exactly the gap
  Phase 2d's dedicated uncertainty tool is meant to close (a better
  mechanism than RAG for that specific question type), not something to
  chase with more threshold tuning.

**Decided:** RAG index (`backend/rag_index/*`, ~49KB) committed directly
rather than gitignored and rebuilt on deploy - same precedent as committing
the trained model weights, and small enough that it's no burden.

**Next:** Phase 2c (external validation + OOD flagging, now unblocked by
Phase 2) or Phase 2d (needs this phase's retrieval tool) - user's choice.

---

## 2026-08-18 (final) — Execution checklists written for every remaining phase (2d, 3, 4, 5)

**Context:** User asked for a total task count across all phases. Phases
1/2/2b/2c already had granular execution checklists in `docs/SCHEDULE.md`;
Phase 2d, 3, 4, and 5 didn't — same gap the user had already caught once for
2/2b/2c. Wrote real, granular checklists for all four, derived from the
rationale already in `docs/NOVELTY_PLAN.md`, matching the existing
checklists' granularity rather than one-line placeholders.

**Did:** Added to `docs/SCHEDULE.md`: Phase 2d (8 steps — tool schema
definition through documenting before/after examples), Phase 3 (7 steps —
turning each existing NOVELTY_PLAN.md narrative bullet into a concrete
write-up step, plus a self-review pass), Phase 4 (10 steps — starting with
fixing the known Dockerfile Python-version conflict found during Phase 1
backend integration, through EC2/S3/ECR/GitHub Actions setup and measuring
real deployed-instance numbers), Phase 5 (6 steps — audit, motion pass,
visual pass, 3D viz, full regression check, log).

**Total task count across all phases, as of this entry:**
Phase 1: 8/8 done · Phase 2: 6/6 done · Phase 2b: 0/7 · Phase 2c: 0/7 ·
Phase 2d: 0/8 · Phase 3: 0/7 · Phase 4: 0/10 · Phase 5: 0/6.
**56 total tasks, 14 done.**

**Next:** user's choice of which phase to start next — nothing blocking any
of them except 2d (needs 2b) and Phase 4's item 1 fix should happen before
any other Phase 4 work.

---

## 2026-08-18 (later) — Frontend uncertainty display; Phase 2d (tool-calling agent) added after honest re-evaluation

**Context:** Two things prompted this entry. First, user asked why Phase 2
checklist step 5 (frontend display of the uncertainty field) hadn't been
done — the honest answer: I'd unilaterally deferred it while heads-down in
backend/ML work without actually checking whether that was okay, which
isn't how deferral decisions should get made. Second, user asked whether
agent/tool-calling (a thing companies increasingly evaluate for) could
genuinely fit this project, explicitly asking for real brainstorming before
any decision - not a reflexive "we already ruled that out."

**Did (frontend uncertainty display):**
- Updated `frontend/src/app/predict/page.tsx`'s `PredictionResult`
  interface to include the `uncertainty` field the backend has returned
  since the Phase 2 entry above.
- Single-scan results view: added a low/medium/high badge (color-coded,
  teal/amber/red) next to the existing confidence bar, plus the raw
  predictive-entropy number and a note that it's MC-Dropout-derived (30
  passes) - so the number is legible, not just decorative.
- Batch queue view: added a compact colored dot (not a full badge - the
  row layout is already tight) next to each scan's confidence percentage,
  with a hover title for the level.
- No API-response mapping changes needed - both the single-scan and batch
  paths already assign the raw fetch response directly into React state, so
  the new field flowed through automatically once the interface was
  updated.
- Verified: `tsc --noEmit` clean, `next build` compiles successfully (the
  only failure was the pre-existing, already-documented missing-Clerk-key
  issue that only affects local builds without a `.env` key, not real
  Vercel deploys - not a regression from this change).

**Did (Phase 2d evaluation and addition):**
- Re-examined the 2026-07-05 conclusion that agentic tool-calling doesn't
  fit this project, specifically looking for a genuine gap rather than
  either reflexively re-confirming the old ruling or reflexively adding the
  buzzword. Ruled out general multi-step agent orchestration again - still
  no real multi-tool workflow in a single-classifier app.
- **Found one real, narrow gap that specifically didn't exist back in
  July**: now that Phase 1/2 produce real uncertainty numbers,
  `backend/llm_service.py`'s `radiologist_chat` has no way to ground its
  own answers about its own confidence - if a user asks "how sure are you
  really?", the LLM can only paraphrase whatever number was in its prompt
  context, not verify or recompute it. That's a genuine, current
  limitation, not an invented one - it didn't exist as a real gap until
  Phase 2 shipped real MC-Dropout output to ground against.
- Scoped **Phase 2d**: give the chat 2-3 real callable tools
  (`get_uncertainty_details`, the Phase 2b retrieval tool, and a future
  `get_external_validation_stats` once Phase 2c ships) and let the model
  choose which to invoke per-question, instead of one blind LLM call. This
  is genuine tool-calling (a choice between distinct tools, decided by the
  model) rather than a fixed pipeline relabeled as agentic.
- User's call: kept as its own distinct phase rather than folded into Phase
  2b, so it's a clearly nameable, separate thing for the interview
  narrative/resume rather than blurred into "the RAG phase."
- Updated `docs/NOVELTY_PLAN.md`: added the Phase 2d section with full
  rationale, corrected the stale "agentic AI doesn't fit either" line in
  Phase 2b's original 2026-07-05 context note (now points to Phase 2d for
  the revised, narrower conclusion), and added Phase 2d to the status
  checklist.

**Decided:** Phase 2d is real and worth building, but explicitly scoped
narrow (2-3 tools, all grounding the assistant's answers about its own
outputs/validation, not a general autonomous agent loop) - the same
"real fit, not buzzword coverage" bar applied to RAG/MCP back in July.

**Next:** Phase 2d depends on Phase 2b (retrieval tool) and benefits from
Phase 2c (external-validation tool) being done first - not the next thing
to build immediately. Still open: Phase 2b, Phase 2c, Phase 2d, Phase 3,
Phase 4, Phase 5 - user's choice of what's next.

---

## 2026-08-18 — Phase 2 done: MC-Dropout uncertainty quantification wired into the backend

**Context:** Phase 1 closed out real Phase 1 work; this session picked up
Phase 2 (uncertainty quantification), which `NOVELTY_PLAN.md` had left as an
open choice between MC-Dropout and conformal prediction. Also: no execution
checklist existed yet for Phase 2/2b/2c (only Phase 1 had one) — wrote real
step-by-step checklists for all three into `docs/SCHEDULE.md` before
starting, matching Phase 1's granularity, per explicit user ask.

**Decided:** MC-Dropout over conformal prediction. Rationale: the model
already has a `Dropout(0.3)` layer in its head (`model_def.py`) — MC-Dropout
needs no architecture change, just forcing dropout active at inference and
running N forward passes, vs. conformal prediction needing a dedicated
calibration split carved out of the data. Simpler technique, still a
legitimate, well-known differentiator to discuss in an interview.

**Did:**
- Confirmed the mechanics are safe before building on them: `model(x,
  training=True)` correctly makes the head's Dropout stochastic while the
  frozen EfficientNetB0 base's BatchNorm stays in inference mode (protected
  by `base.trainable = False`, which the nested functional call respects
  regardless of the outer `training` flag) — verified empirically
  (`training=False` deterministic, `training=True` stochastic, and the
  training=True mean stays close to the deterministic pass, confirming BN
  wasn't corrupted).
- Wrote `model/mc_dropout_eval.py`: runs N=30 stochastic passes per image
  across the full held-out test set (1,094 images, the same split used for
  every other Phase 1 metric), computes predictive entropy on the *mean*
  distribution across passes (the standard MC-Dropout "predictive entropy"
  measure — not average per-pass entropy, which would miss the actual
  epistemic spread), and checks whether the resulting signal separates
  correct from incorrect predictions before trusting it enough to wire into
  the backend. Explicitly designed to report a negative finding honestly if
  the signal turned out weak, not to declare success regardless of outcome.
- Hit the same fine-tuned-checkpoint loading quirk as before (TF 2.10's H5
  format needs matching trainable-structure at load time) — fixed by
  pointing the eval script at `backend/model/brain_mri_efficientnetb0.weights.h5`
  (the inference-only re-saved checkpoint from the backend integration
  session) instead of the original `finetuned_best.weights.h5`, avoiding the
  issue entirely rather than re-solving it.
- **Result: strong, usable signal.** Incorrect predictions showed **7.17x
  higher predictive entropy** than correct ones (0.554 vs 0.077 mean
  entropy; 74.6% vs 97.2% mean confidence). Per-class entropy also lines up
  with Phase 1's independent finding that meningioma is the hardest class —
  meningioma has the highest per-class entropy (0.186) of all four classes,
  a coherent, reinforcing result rather than noise. Full numbers in
  `docs/METRICS.md`.
- Wired MC-Dropout into `backend/ml_service.py`: added `estimate_uncertainty()`
  (30 passes, predictive entropy, a low/medium/high label bucketed around the
  test-set-observed correct/incorrect entropy split) and a new `uncertainty`
  field in `predict()`'s response. **Deliberate design choice**: kept the
  existing single deterministic pass as the primary prediction/confidence/
  Grad-CAM source, unchanged from before Phase 2 — MC-Dropout runs as an
  *additional* signal, not a replacement, so the already-documented Phase 1
  numbers in `docs/METRICS.md` stay valid and nothing shifts unexpectedly.
- Verified end-to-end against a running server (port 8500, to avoid
  colliding with unrelated LG-internship backend servers already running on
  8000/8010-8013 on this machine — left those alone, not in scope here):
  - A correctly-classified, high-confidence glioma image (99.99%) showed
    very low entropy (0.0015, "low" bucket) — expected.
  - A correctly-classified meningioma image (96.18% confidence) showed
    "medium" uncertainty (entropy 0.211) *despite* being correct — matches
    the aggregate finding that the model is measurably more hesitant on
    this class even when it gets the answer right, which is exactly the
    kind of nuance a bare confidence number would hide.
- **Measured the real latency cost, not hidden**: ~14-15s per request
  warm (14.0s/14.9s/14.6s across 3 runs), up from ~0.79s before Phase 2 — a
  real ~18x latency increase from 30 sequential CPU forward passes. Logged
  honestly in `docs/METRICS.md` alongside a note on what a production
  system would do about it (fewer passes, batched/parallel passes, GPU
  serving, or making it optional/async) rather than optimizing it away
  silently before it was ever measured.

**Not yet done:** frontend display of the uncertainty field (Phase 2
checklist step 5 — API returns it correctly now, UI doesn't show it yet;
deferred, doesn't block calling the backend/ML side of Phase 2 done). Phase
2c (external validation + OOD flagging) is now unblocked since it depends
on this uncertainty signal, but not started this session.

**Next:** user's choice between Phase 2b (grounded RAG), Phase 2c (external
validation + OOD flagging, now unblocked), Phase 3 (narrative write-up), or
the deferred frontend uncertainty display.

---

## 2026-07-31 (final) — Real model wired into the backend, mock model retired (Phase 1 core work done)

**Context:** With the fine-tuned model at 94.42% held-out test accuracy (see
entry below), the last real Phase 1 gap was that `backend/` still served the
untrained mock (`VGGSKin.h5`, random 1-conv-layer network). Replaced it
end-to-end.

**Corrected a scope misunderstanding, same session:** briefly treated this
project as also being an internship deliverable (per a stale note in
`docs/SCHEDULE.md`). User corrected this — it's a personal project only,
the internship only explains the reduced ~4-day/week cadence. Fixed the
stale note in `SCHEDULE.md`. Also discussed and decided (user's call, my
recommendation): keep this as one repo rather than splitting into a
separate "improvement project" repo — the git history (mock model → real
training → fine-tuning) is itself part of the interview narrative.

**Did:**
- Pinned `backend/requirements.txt`'s `tensorflow-cpu` to `==2.10.0` (was
  unpinned - would have resolved to a much newer TF/Keras with a different
  API on a fresh install) and `numpy<2`, matching `training_env` exactly -
  avoids a training/serving version mismatch, which `docs/NOVELTY_PLAN.md`
  flagged as a risk to avoid back in Phase 1 planning.
- Added `backend/model_def.py`: a minimal, self-contained copy of
  `model/model_def.py`'s `build_model()` (with `weights=None` on the
  EfficientNetB0 base, since real trained weights are loaded immediately
  after and there's no reason to also download ImageNet weights on every
  backend cold start). Kept deliberately independent of the training-only
  `model/` directory (which needs kagglehub/imagehash/scikit-learn - not
  backend deps) so `backend/` stays deployable on its own.
- **Re-saved the fine-tuned checkpoint as a clean inference-only weights
  file**: loaded `finetuned_best.weights.h5` with the fine-tuning trainable
  structure (`unfreeze_for_finetuning(base, 163)`), then re-saved with
  `base.trainable = False` (the default/frozen structure). This decouples
  serving entirely from the fine-tuning trainable-structure quirk noted in
  the previous DEVLOG entry - the backend never needs to know fine-tuning
  happened, it just loads a normal frozen-structure model. Verified
  bit-identical predictions (`max abs diff: 0.0`) between the original and
  re-saved weights on random input before treating this as safe. Saved as
  `backend/model/brain_mri_efficientnetb0.weights.h5` (~16.5MB, committed
  directly - no LFS needed at this size).
- Rewrote `backend/ml_service.py`:
  - Preprocessing now matches training exactly: 224×224 (was 128×128),
    force-decode to grayscale then replicate to 3 channels (was plain RGB -
    see the "Resolved RGB/grayscale question" DEVLOG entry for why this
    matters), `efficientnet.preprocess_input` (was none).
  - Model loading now builds the architecture via `model_def.build_model()`
    and calls `load_weights()` (was `tf.keras.models.load_model()` on a full
    `.h5` - doesn't apply to a weights-only checkpoint).
  - Class name handling: internal order (`glioma, meningioma, notumor,
    pituitary`) now explicitly matches `model/data_pipeline.py`'s
    `CLASS_NAMES` exactly, with a separate `display_names` mapping to the
    existing user-facing strings (`'Glioma Tumor'`, etc.) - the old code
    conflated the two.
  - **Hit and fixed a real Grad-CAM bug**: the naive approach (reaching into
    the nested `efficientnetb0` Functional submodel via
    `model.get_layer('efficientnetb0').get_layer('top_conv').output`, then
    building a `Model([model.inputs], [that_output, model.output])`) failed
    at runtime with `Graph disconnected: cannot obtain value for tensor ...
    input_1`. Root cause: the submodel's `.output` tensor is rooted at its
    *own* internal `Input` layer, not the outer model's real input, so
    Keras can't trace a path between them. A second attempt - manually
    replaying `base.layers` one-by-one to hand-build a fresh forward pass -
    also failed, because EfficientNetB0's MBConv blocks contain
    Squeeze-Excite `Multiply`/`Add` layers that need multiple named inputs,
    not a single chained tensor; sequential replay breaks the graph
    topology. **Fix**: build a small sub-model from `base.input` to
    `top_conv` (shares the same weight objects as `base`, not a copy), call
    it functionally on one fresh top-level `Input`, then continue through
    the base's remaining post-`top_conv` layers (none of which branch:
    `top_bn`, `top_activation`, `avg_pool`) and the outer head, all within a
    single `Model()` graph built once at `MLService` init time (not
    per-request). Verified: gradients are no longer `None`, heatmap has the
    correct `(7, 7)` shape, and a decoded sample heatmap visually shows the
    expected warm-color concentration over actual brain tissue rather than
    noise or a uniform wash.
  - Report generation simplified slightly (dropped an unused
    `probabilities` parameter from `generate_detailed_report` - it wasn't
    actually used in the report text, just passed through).
- Removed all mock model artifacts now that a real model is serving:
  `backend/model/VGGSKin.h5`, `backend/model/generate_mock_model.py`, and
  the root-level duplicate `model/generate_mock_model.py` (per the "nested
  duplicate" note in `CLAUDE.md`).
- Set up `backend/venv` on this machine (didn't exist here yet - gitignored,
  machine-local, same situation `training_env` was in earlier), Python 3.10
  to match the new `tensorflow-cpu==2.10.0` pin.
- **Verified end-to-end against the running server**: `/health` reports
  `model_loaded: true`; sent a real held-out-test glioma image through
  `/api/predict` - correct prediction (`Glioma Tumor`, 99.99% confidence),
  correct probabilities, and a real Grad-CAM heatmap (visually confirmed by
  decoding and viewing the returned PNG).
- Measured real (not estimated) inference latency: mean 0.79s per request
  warm (min 0.71s, max 0.88s, n=10, local CPU-only dev machine, single
  sequential requests, includes preprocessing + inference + Grad-CAM +
  heatmap encoding), 2.31s on the very first request (TF graph tracing
  overhead). Logged in `docs/METRICS.md`.
- **Found a real issue to flag for Phase 4, not fixed now**: `backend/
  Dockerfile` is `python:3.11-slim`, but the newly-pinned
  `tensorflow-cpu==2.10.0` requires Python ≤3.10 (same constraint that
  forced `training_env` onto a separate Python version earlier in Phase 1).
  The existing Dockerfile would fail to install this pin. Needs a base
  image change (e.g. `python:3.10-slim`) when Phase 4 (Docker
  hardening) is actually worked on - not fixed in this session since Phase
  4 is explicitly sequenced after Phase 1/2 in `docs/NOVELTY_PLAN.md`.

**Decided:** This closes out the core of Phase 1 - real trained model,
honest metrics, and now actually serving real predictions instead of a
mock. Remaining Phase 1 checklist item is step 7's write-up polish (the
real numbers already exist across this entry and the fine-tuning entry
below); the mock-model credibility gap that started this whole project is
resolved.

**Next:** Phase 2 (uncertainty quantification) or finish Phase 1 step 7's
write-up polish first - user's call. Also: AWS (not GCP) confirmed as the
deployment target for Phase 4, consistent with the free-tier EC2/S3/ECR
plan already in `docs/NOVELTY_PLAN.md`.

---

## 2026-07-31 (later) — Fine-tuning pass: 94.42% held-out test accuracy, meningioma gap mostly closed (Phase 1, step 6 done)

**Context:** Continuing directly from the frozen-base pass earlier today
(88.12% test accuracy, meningioma the clear weak class at 76.3% precision).
Phase 1 checklist step 6 — fine-tune to see if unfreezing part of the base
closes that gap.

**Did:**
- Wrote `model/finetune.py`: loads the frozen-base best weights, unfreezes
  EfficientNetB0 from layer index 163 onward (`block6a_expand_conv` through
  `top_activation` — the last two MBConv block groups + final conv, 76/239
  base layers), keeps BatchNorm layers frozen throughout the unfrozen range
  (standard practice — retraining BN statistics on a ~5k-image dataset at a
  low LR is a known source of instability), and retrains at `lr=1e-5`
  (~100x lower than the frozen-base pass) for up to 15 epochs.
- Refactored the unfreeze logic into `model_def.unfreeze_for_finetuning()`
  (shared by `finetune.py` and, now, `check_fit.py`) rather than duplicating
  it — needed anyway once the evaluation bug below was found.
- **Hit and fixed a real bug:** `check_fit.py` failed to load the fine-tuned
  checkpoint (`ValueError: axes don't match array` in `load_weights()`).
  Root cause: TF 2.10's Keras H5 weight format is sensitive to a model's
  `trainable`-flag structure at save vs. load time — a checkpoint saved with
  some base layers unfrozen can't be loaded into a freshly-built model that
  defaults to a fully-frozen base, even though the architecture is
  identical. Fixed by adding `--unfreeze-from-layer` to `check_fit.py` so it
  can reconstruct the exact same trainable structure before calling
  `load_weights()`. Documented in `model_def.unfreeze_for_finetuning()`'s
  docstring so this isn't rediscovered later.

**Results:**
- Trained the full 15 epochs (did not early-stop — val_accuracy was still
  improving at epoch 15, best 95.40%), 9.2 min wall clock.
- **Held-out test accuracy: 88.12% → 94.42% (+6.30 points)**, val-test gap
  tightened to 0.98 points (very well-calibrated). Train accuracy reached
  99.4% but val/test tracked it closely throughout — no overfitting signal
  despite the high train accuracy, per `check_fit.py`'s curve analysis
  (final train-val gap 4.0 pts, under the 8-pt threshold).
- **Meningioma gap substantially closed**, the specific thing this pass
  targeted: precision 76.31% → 87.86% (+11.55 pts), recall 82.33% → 92.48%
  (+10.15 pts). Per-class F1 now: glioma 94.05%, meningioma 90.11%, no-tumor
  97.33%, pituitary 96.13% — meningioma is still relatively the hardest
  class but no longer a standout weak point.
- Full before/after numbers in `docs/METRICS.md` (fine-tuned result is now
  the headline Phase 1 number; frozen-base kept as the comparison baseline).

**Decided:** This is a strong enough result to treat as the Phase 1 model
for now — not chasing further hyperparameter tuning at this stage. Backend
integration (replacing the mock `VGGSKin.h5`) and the full rigorous
evaluation write-up (step 7) are next, not further fine-tuning iteration.

**Next:** Phase 1 step 7 — full evaluation write-up (this session's
`check_fit.py` output is the real numbers, just needs write-up polish), then
backend integration.

---

## 2026-07-31 — First real training run complete: 88.12% held-out test accuracy (Phase 1, step 5 done)

**Context:** Resuming Phase 1 on a different machine, without the external HDD
("Elements", D:) that holds `D:\NeuralPath-AI-data\` (dataset, split manifest,
checkpoints) — user is traveling and left the drive at home. Confirmed this is
the same canonical git repo (same remote, same last commit `06cef2b8`), just a
different physical machine than where the 2026-07-12 D: setup happened; not a
stale/duplicate checkout.

**Also corrected a wrong assumption mid-session:** initially believed
`model/data_pipeline.py`, `model/model_def.py`, etc. were uncommitted and lost
(an earlier `Glob` call spuriously returned empty for `model/*.py`). Re-checked
with `git ls-files` — all 8 scripts were in fact already committed and present.
Nothing was actually lost; only the D:-drive *data* (not code) was unavailable.

**Did:**
- Added `model/paths.py` as the single source of truth for data/checkpoint
  locations (`DATA_ROOT`), replacing hardcoded `D:\NeuralPath-AI-data\...`
  strings duplicated across `download_dataset.py`, `build_split.py`,
  `data_pipeline.py`, `check_duplicates.py`, `eda_dataset.py`. Temporarily
  points at a new `local_data/` folder at the repo root (gitignored) since D:
  isn't attached on this machine; migrating back to the external HDD later is
  a one-line change to `paths.py` plus moving the files, not a multi-file edit.
- Re-ran the full Phase 1 data pipeline locally on `C:` (has ~64.6GB free,
  confirmed before starting): `download_dataset.py` (Kaggle
  masoudnickparvar/brain-tumor-mri-dataset), `eda_dataset.py`, `build_split.py`.
  **All results reproduced exactly**: 7,200 images matching the 2026-07-12 EDA
  counts, 6,212 perceptual-hash clusters, identical 5,040/1,066/1,094
  train/val/test split (fixed seed=42 held) — confirms the pipeline is
  genuinely reproducible, not accidentally environment-dependent.
- Verified `data_pipeline.py` and `model_def.py` still work correctly against
  the local data (GPU picked up: RTX 2050 detected via CUDA/cuDNN, same as the
  original machine's setup — training env `training_env/` and the CUDA 11.2/
  cuDNN 8.1 OS install both survived on this machine, only D: data was gone).
- Wrote `model/train.py` (first training run, frozen base, up to 15 epochs,
  `ModelCheckpoint` on `val_accuracy` + `EarlyStopping` patience=4) and ran it.
- **Hit and fixed a real bug**, twice: TF 2.10's Keras H5 saver
  (`model.save(...)`, and `ModelCheckpoint(save_weights_only=False)`) throws
  `TypeError: Unable to serialize [...] to JSON` on certain optimizer state
  tensors — a known Keras/H5-format quirk in this TF version, not a data or
  model-architecture bug (training itself completed correctly both times this
  hit; only the save step failed). Fixed by switching to weights-only
  checkpointing (`save_weights_only=True`, `.weights.h5`) and dropping the
  full-model `.h5` save entirely — the model is reconstructed from
  `model_def.build_model()` + loaded weights instead, which is what
  `check_fit.py` and the eventual backend integration will do anyway. Also
  reordered `train.py` to write the history JSON *before* attempting any
  model save, so a save failure can't lose the actual training results again.
- Wrote `model/check_fit.py` (requested by user specifically for over/underfitting
  checking) — two-part diagnostic: (1) analyzes the saved per-epoch history for
  overfitting (train-val accuracy gap, val_loss rising after its minimum while
  train_loss keeps falling) and underfitting (both accuracies staying low)
  signals; (2) runs true evaluation on the `test` split (never seen in training
  or checkpoint selection — the only real way to assess generalization, not
  just the training curves) with per-class precision/recall/F1
  (`sklearn.metrics.classification_report`) and a confusion matrix. Installed
  `scikit-learn` into `training_env` (wasn't there before, needed for this).

**Results (first pass, frozen base only, no fine-tuning yet):**
- Training: 11 epochs, early-stopped (patience=4 past best), 4.7 min wall
  clock on the RTX 2050. Best val_accuracy 90.43% (epoch 7).
- **No overfitting or underfitting detected** — train/val loss and accuracy
  tracked each other closely throughout; final train-val accuracy gap only
  2.5 points.
- **Held-out test accuracy: 88.12%** (1,094 images, genuinely unseen during
  training/checkpoint selection). Per-class: glioma 87.0% F1, meningioma
  79.2% F1, no-tumor 94.4% F1, pituitary 91.6% F1.
- **Honest weak point, not hidden:** meningioma is the hardest class (76.3%
  precision, 82.3% recall) — most often confused with pituitary (23 cases)
  and glioma (15 cases) per the confusion matrix. This tracks with meningioma
  being clinically the most visually heterogeneous of the three tumor types
  on MRI, so it's a legitimate, explainable interview talking point rather
  than a pipeline problem to be suspicious of.
- Full numbers recorded in the new `docs/METRICS.md` (see below).

**Also did (per explicit user request):** created `docs/METRICS.md` — a
running log of real, measured numbers only (model performance, training/
compute, latency once backend integration happens, dataset stats), intended
as the sourced basis for resume/ATS bullets and interview claims. **Decided,
after asking the user:** committed to git (not gitignored) — these are just
measured results with no secrets/PHI, and versioning shows how numbers evolve
across phases (e.g. after fine-tuning or uncertainty quantification). Every
number in it must trace back to an actual script run logged in this file.

**Not yet done:** fine-tuning pass (Phase 1 step 6 — unfreeze top base layers,
lower LR, likely needed to push past the meningioma weak point), full
rigorous evaluation write-up (step 7, this session's `check_fit.py` run is the
preliminary version), backend integration (replacing the mock `VGGSKin.h5`),
and migrating `local_data/` back to `D:\NeuralPath-AI-data\` once the external
HDD is available again (script paths are ready for this via `paths.py`, no
other code changes needed).

**Next:** Phase 1 step 6 — fine-tuning pass (unfreeze top EfficientNetB0
layers, lower learning rate), see if it closes the meningioma gap. Then step 7
(full evaluation write-up) before Phase 1 is marked done.

---

## 2026-07-12 — GPU training environment working end-to-end (Phase 1, step 1 done)

**Context:** First real Phase 1 execution step — get the RTX 2050 usable for
TensorFlow training. Native Windows TF dropped GPU support after 2.10, so this
required pinning to TF 2.10 rather than the latest release.

**Did:**
- Installed Python 3.10.11 (via winget) alongside existing 3.11/3.12, since TF
  2.10's Windows GPU wheel requires Python ≤3.10.
- Created `training_env/` (Python 3.10 venv, separate from `backend/venv`) at the
  project root.
- Installed CUDA 11.2 toolkit and cuDNN 8.1.1 — both required manual browser
  downloads from NVIDIA (no API/CLI path exists for either on Windows). Hit two
  snags along the way:
  - CUDA installer initially refused to proceed ("newer NVIDIA FrameView SDK
    already installed") — FrameView SDK is an unrelated bundled overlay/telemetry
    component, not the GPU driver. Fixed by uninstalling it via its registry
    uninstall string before retrying.
  - NVIDIA's cuDNN archive page has near-identical download links for the CUDA
    10.2 and CUDA 11.x builds of the same cuDNN 8.1.1 release, sitting next to
    each other — grabbed the wrong (10.2) one on the first attempt, caught it
    before installing, corrected to the CUDA 11.2 build.
  - Copying cuDNN's `bin/include/lib` into the CUDA install directory required
    admin elevation (`Program Files` isn't writable otherwise).
- `pip install tensorflow==2.10` inside `training_env`. Hit two follow-on issues,
  both fixed:
  - pip pulled NumPy 2.2.6 by default, which breaks TF 2.10 (compiled against the
    NumPy 1.x C API) — pinned to `numpy<2` (resolved to 1.26.4).
  - Initial GPU check failed with `cudart64_110.dll not found` — not a real
    problem, just that the shell session used for the check predated the CUDA
    installer adding its `bin` directory to system PATH. A fresh process picked
    it up correctly.
- Verified end-to-end: `tf.config.list_physical_devices('GPU')` lists the RTX
  2050, `tf.test.is_built_with_cuda()` returns `True`, and an actual `tf.matmul`
  ran and completed on `/GPU:0` (compute capability 8.6 correctly detected).
- Saved exact working package versions to `training_env_requirements.txt` at the
  repo root (key pins: `tensorflow==2.10.0`, `numpy==1.26.4`, `keras==2.10.0`) —
  needed for reproducibility given how version-sensitive this whole stack is.

**Decided (storage, same session):** `C:` had only ~15GB free (unrelated Steam +
app cache bloat, not this project — user deferred cleanup). Created
`D:\NeuralPath-AI-data\dataset\` and `D:\NeuralPath-AI-data\checkpoints\` on the
external USB HDD for the Kaggle dataset and trained model artifacts. Repo,
`training_env`, `backend/venv`, and the CUDA/cuDNN install all stay on `C:` —
those need fast, low-latency I/O and stable paths that a USB HDD can't reliably
provide.

**Also decided (working conventions, same session):** switched to a 4-productive-
days/week cadence (user is doing this alongside an internship) — Claude executes
phases directly, teaching happens after a phase is done, on request, not forced
inline. Documented in `docs/SCHEDULE.md` and `CLAUDE.md`. Also: never run `git
commit`/`git push` in this repo unless explicitly asked in the moment — user
doesn't want Claude appearing as a GitHub co-author.

**Next:** Download and inspect the Kaggle Brain Tumor MRI Dataset onto
`D:\NeuralPath-AI-data\dataset\` (class counts, image sizes/formats, obvious
quality issues) — the next step in the Phase 1 execution checklist in
`docs/SCHEDULE.md`.

---

## 2026-07-12 (later) — Kaggle dataset downloaded, EDA run (Phase 1, step 2 done)

**Context:** Second Phase 1 execution step — get the dataset, inspect it before
building the data pipeline.

**Did:**
- Set up Kaggle API credentials (`C:\Users\Sahil Sharma\.kaggle\kaggle.json`,
  permissions locked to the user's own Windows account via `icacls`). Note: user
  initially pasted their raw API key into chat — advised revoking it immediately
  and regenerating a fresh one, which is what was actually used. Deleted the
  plaintext key file from Downloads after use.
- Wrote `model/download_dataset.py` (uses `kagglehub`) and downloaded
  masoudnickparvar/brain-tumor-mri-dataset (~157MB) to
  `D:\NeuralPath-AI-data\dataset\` (per the storage-split decision in the entry
  above — data lives on the external drive, not `C:`).
- Wrote `model/eda_dataset.py` and ran a full EDA pass. Findings:
  - **7,200 total images**, perfectly class-balanced: 1,400/class × 4 classes in
    `Training/` (5,600), 400/class × 4 in `Testing/` (1,600).
  - **No corrupt/unreadable files** across all 7,200 images.
  - **Formats**: 7,196 JPEG, 4 PNG.
  - **Color mode is mixed**: 4,129 RGB vs 3,067 grayscale (`L`), plus a few
    RGBA/palette. MRI is inherently grayscale, so this needs a visual spot-check
    and an explicit, documented normalization decision in the preprocessing
    pipeline (current `ml_service.py` resize step doesn't address channel
    handling) — not yet resolved, flagged for the data pipeline step.
  - **Image size highly non-uniform**: 447 distinct sizes, dominant cluster at
    512×512 (5,014 images), long tail down to e.g. 150×198. Expected for a
    Kaggle-aggregated multi-source dataset; confirms resizing to 224×224 (for
    EfficientNetB0) is a real, necessary step, and is itself a live example of
    the scanner/protocol-variation problem already discussed in
    `NOVELTY_PLAN.md`.
  - **820 file-size-collision groups covering 1,758 files** — a cheap/weak
    duplicate signal (same byte size, not a hash comparison), not confirmed
    duplicates. **Not yet resolved — real risk, not cosmetic:** if genuine
    duplicate or near-duplicate images (e.g. adjacent slices from the same scan)
    exist across the provided Training/Testing split, that's a data leakage risk
    that would inflate the eventual test accuracy. Needs a proper check (e.g.
    perceptual hash or exact byte hash) before trusting the provided split, or
    before building our own stratified split in the next step.

**Decided:** Not resolving the potential-duplicate/leakage question today — it's
the natural next task (Day 2 / step 3 of the Phase 1 checklist: split design).
Flagging it explicitly here rather than silently trusting the Kaggle-provided
Training/Testing split, consistent with this project's rigor-over-polish
principle.

**Next:** Design and document the train/val/test split — including resolving the
duplicate-image question above before finalizing it — and the data augmentation
strategy (Phase 1 checklist step 3 in `docs/SCHEDULE.md`).

---

## 2026-07-12 (later still) — Leakage confirmed and fixed; leakage-safe split built (Phase 1, step 3 done)

**Context:** The EDA pass flagged a weak duplicate signal (820 file-size-collision
groups). Needed a real check before trusting Kaggle's provided Training/Testing
folders for evaluation — file-size collisions alone don't confirm duplication or
leakage.

**Did:**
- Wrote `model/check_duplicates.py`: exact SHA-256 hash + perceptual hash
  (`imagehash.phash`, hamming distance 0) across all 7,200 images.
- **Result: real leakage confirmed.** 153 exact-duplicate groups, all contained
  within a single split (harmless). But **294 perceptual near-duplicate groups
  spanned Training and Testing, involving 855 files (~12% of the dataset)** —
  almost certainly adjacent slices from the same scan/patient appearing in both
  the training set and the "held-out" test set. This is a textbook medical-
  imaging leakage failure mode: a model could partially memorize a scan during
  training and then be evaluated on a near-identical slice of the same scan,
  inflating the reported test accuracy in a way that would not reflect real
  generalization. Confirms the EDA's weak signal was a real problem, not noise.
- **Fix:** wrote `model/build_split.py` — pools all 7,200 images (ignoring
  Kaggle's provided Training/Testing folders entirely), re-clusters them by
  perceptual hash so near-duplicates are grouped, then performs a **stratified
  split at the cluster level** (not the individual-file level) into
  train/val/test (70/15/15, fixed seed=42). This guarantees no near-duplicate
  pair can end up split across two different sets.
- Result: 6,212 clusters from 7,200 files (988 images had ≥1 near-duplicate
  partner, now kept together). Final split: train=5,040 (70.0%), val=1,066
  (14.8%), test=1,094 (15.2%) — fractions landed almost exactly on target, and
  per-class balance held up well across all three splits (no class collapsed or
  skewed). Output written to `D:\NeuralPath-AI-data\split_manifest.csv`
  (filepath, class, split columns) — **the data pipeline must read from this
  manifest, not walk the Training/Testing folders directly**, or the leakage fix
  is silently undone.

**Decided:** This is now the canonical split for all Phase 1 training/evaluation
and for Phase 2c's later external-validation comparison. Seed (42) and full
methodology documented here and in the script docstring for reproducibility, per
this project's audit-rigor convention.

**Not yet resolved:** the mixed RGB/grayscale channel question from the EDA
entry above is still open — needs a decision when building the data
loading/preprocessing pipeline (next step).

**Next:** Implement the data loading script (reading `split_manifest.csv`) and
the EfficientNetB0 model definition (frozen base + classification head) — Phase
1 checklist step 4.

---

## 2026-07-12 (later still) — Resolved RGB/grayscale question; found a real data-provenance issue

**Context:** The EDA flagged mixed RGB (4,129) vs grayscale (3,067) images as an
open question needing a decision before building the preprocessing pipeline.

**Did:**
- Wrote `model/inspect_channels.py`: samples RGB-mode images, checks whether
  R/G/B channels are near-identical (i.e. actually grayscale content stored
  redundantly in 3 channels — common when different tools export the same MRI
  data) vs genuinely containing color information.
- **Result: 191/200 sampled RGB images (95.5%) are channel-duplicated —
  effectively grayscale.** Confirms the dataset is overwhelmingly grayscale MRI
  regardless of stored color mode, consistent with the modality. **Decision:**
  preprocessing will convert everything to a single grayscale channel then
  replicate to 3 channels for EfficientNetB0's ImageNet-pretrained input (not
  trust the stored RGB data), so this becomes a uniform, explicit, documented
  step rather than relying on whatever mode each source file happened to be
  saved in.
- **The remaining 9/200 (4.5%) outliers are a real, separate data quality
  finding, not noise — all from the `notumor` class.** Manually inspected
  several:
  - `Tr-no_921.jpg`: has a solid blue border and a pixelated color-artifact
    strip — looks like a PACS radiology-viewer screenshot, not a raw scan
    export. UI chrome, not tissue signal.
  - `Te-no_63.jpg`: has a **visible "Medscape" watermark** in the corner —
    this image was sourced from a medical reference website (medscape.com),
    not from a raw clinical scan export.
  - `Tr-no_399.jpg`, `Tr-no_1054.jpg`: essentially normal-looking MRI slices
    with minor JPEG color-compression noise, not a real provenance issue.
  - **Conclusion:** at least part of the `notumor` class in this Kaggle dataset
    was aggregated from mixed sources including web/reference images with
    visible branding, not solely from clinical scan exports. This is a genuine
    data provenance caveat worth stating plainly in the eventual interview
    writeup (Phase 3) — it's exactly the kind of "know your training data"
    issue a clinical-AI interviewer would want to see acknowledged, not hidden.
    Not fixing/filtering these individual files now (9/4,129 sampled is a small
    fraction, and this was a spot-check, not an exhaustive audit) but flagging
    it as a known, documented limitation rather than something discovered and
    ignored.

**Decided:** Channel handling — grayscale-then-3-channel-replicate, uniformly
applied regardless of source file's stored mode. Documented here for
reproducibility. Data provenance issue (watermarked/screenshot-sourced images in
`notumor`) logged as a known limitation, not remediated in Phase 1 — revisit if
it turns out to meaningfully affect `notumor` class performance during
evaluation (Phase 1 step 7) or comes up again in Phase 2c's external validation.

**Next:** Implement the data loading/preprocessing script (reads
`split_manifest.csv`, resize to 224×224, grayscale→3-channel conversion) and the
EfficientNetB0 model definition (frozen base + classification head) — Phase 1
checklist step 4.

---

## 2026-07-12 (final) — Data pipeline and model definition built (Phase 1, step 4 done)

**Did:**
- `model/data_pipeline.py`: `tf.data` pipeline reading `split_manifest.csv`
  (never the raw `Training`/`Testing` folders — see the leakage-fix entry
  above). Resizes to 224×224, force-decodes every image to single-channel then
  replicates to 3 channels (the channel-normalization decision from the entry
  above), applies `efficientnet.preprocess_input`. Class order
  (`glioma, meningioma, notumor, pituitary`) matches `backend/ml_service.py`'s
  existing `class_names` order for later serving compatibility. Light
  augmentation (horizontal flip, brightness, contrast) available via an
  `augment=True` flag, applied only when explicitly requested (i.e. for the
  training split, not val/test). Verified: loads 5,040/1,066/1,094
  train/val/test images respectively, batches shape correctly to
  `(16, 224, 224, 3)`.
- `model/model_def.py`: EfficientNetB0 (ImageNet-pretrained, `include_top=False`,
  `pooling="avg"`) with the base frozen, feeding a new
  `Dropout(0.3) → Dense(4, softmax)` head. Verified: 4,054,695 total params,
  4,049,571 frozen (base) + 5,124 trainable (head only) — matches the intended
  "frozen base first" transfer-learning strategy from `docs/SCHEDULE.md`.
  Compiled with Adam (lr=1e-3), sparse categorical crossentropy, accuracy metric.
- Data augmentation strategy note: kept intentionally light (flip/brightness/
  contrast only, no rotation yet — `tf.image` doesn't have a core rotation op;
  would need a Keras preprocessing layer if added later) since MRI slices have a
  meaningful canonical orientation and aggressive augmentation could distort
  anatomically relevant features. Revisit if training shows overfitting the
  frozen-head pass can't fix.

**Next:** First training run (frozen base) — Phase 1 checklist step 5. Watch
loss/accuracy curves for overfitting or class-imbalance effects (class balance
is not a concern here per the split composition above, but worth confirming
empirically).

---

## 2026-07-08 — Working model changed: internship constraint, Claude executes, teaching moved to on-request

**Context:** User started an internship on 2026-07-06 and can no longer work on this
project daily. Available time is ~4 high-productivity days per week (not
daily, not weekend-only). Also ran a full OneDrive→C:\Projects migration audit this
session — confirmed clean (nothing missing, only cleanup was a duplicate `.env*`
line in `.gitignore` and a stale pre-deletion audit script `check_and_backup.ps1`,
both resolved this session; see below).

**Decided:**
- Given the reduced/irregular cadence, switched the working model from "Claude and
  user build together with theory alongside each day" (the original
  `SCHEDULE.md` daily plan) to **Claude executes each phase directly** (build,
  train, evaluate, integrate), with **teaching moved to after a phase is done, on
  request** — not forced inline. DEVLOG.md entries remain the record of what was
  built/why and are the anchor for any later walkthrough request.
- Estimated hands-on hours per phase (from a separate discussion, not yet written
  up elsewhere): Phase 1 ~20-28 hrs, Phase 2 ~12-16 hrs, Phase 2b ~12-16 hrs,
  Phase 2c ~8-12 hrs, Phase 3 ~4-8 hrs, Phase 4 ~10-14 hrs, Phase 5 ~8-14 hrs.
  At ~4 productive days/week this projects to roughly **6-7 weeks elapsed** across
  Phases 1-5, still within the 3-6 month interview runway.
- Updated `docs/SCHEDULE.md`: replaced the "learn alongside building, ~3-5
  hrs/day starting immediately" constraints section with the internship-cadence
  model above, and collapsed Week 1's rigid day-by-day breakdown (Day 1...Day 7,
  each with a "Theory alongside" bullet) into a single Phase 1 execution
  checklist, since forced daily teaching no longer matches how work will actually
  happen.

**Also did (migration audit):**
- Verified `C:\Projects\NeuralPath-AI` has everything from the old OneDrive
  location: `.env` files, all three `VGGSKin.h5` copies (including the nested
  legacy `NeuralPath-AI/` duplicate), full git history, correct remote. Confirmed
  the old OneDrive path now only has the harmless leftover `.claude/settings*.json`
  (13KB) — matches what the 2026-07-06 entry below claims.
- Fixed a duplicated `.env*` line in `.gitignore` (harmless but sloppy) —
  confirmed the fix brought it byte-identical to the already-committed version, so
  nothing needed to be committed.
- Deleted `check_and_backup.ps1` (untracked, root of repo) — it was a one-time
  pre-deletion audit script hardcoded to the now-deleted OneDrive path; its job
  was done and it had no further use.

**Next:** Begin Phase 1 execution per the new `docs/SCHEDULE.md` checklist —
training environment setup, GPU check, Kaggle dataset download/EDA.

---

## 2026-07-06 — Project moved out of OneDrive to C:\Projects\NeuralPath-AI

**Context:** User's OneDrive storage was full. This project (large ML deps: venv,
node_modules, model weights) doesn't belong in a synced folder anyway — sync
lag/file-lock issues are a real risk for this kind of project.

**Did:**
- Removed regenerable bloat first: `node_modules`, `backend/venv`, `frontend/.next`
  (project dropped from 2.92GB to 464MB — confirmed all three were pure
  build/dependency artifacts, not source).
- Created `C:\Projects` and robocopied the remaining ~464MB (source, docs, `.git`,
  `.env` files, both `.h5` model weight files, the `.vercel` project link) to
  `C:\Projects\NeuralPath-AI`. Verified: identical size, identical `git log -1`
  commit hash, identical `git status`, `.env` and model weights confirmed present
  byte-for-byte via `ls`.
- Verified the new location is fully functional: fresh `npm install` succeeded,
  `next build` compiled successfully (only failure was the expected/harmless
  missing-Clerk-key issue that only affects local builds, not real Vercel deploys —
  same behavior as at the old location).
- Deleted the original OneDrive folder's contents. Full folder deletion was blocked
  ("device or resource busy") because the active Antigravity IDE/session had it as
  an open workspace/working directory; force-killing Antigravity IDE and retrying
  still left a `.claude/settings.json` (this session's own local config) undeletable
  for the same reason — left in place deliberately rather than risk destabilizing
  the live session. Only ~5KB remains at the old path; harmless, can be deleted from
  a future session that isn't anchored there.
- Updated `CLAUDE.md` with the new canonical path and a note that the OneDrive path
  is stale/gone.

**Decided:** `C:\Projects\NeuralPath-AI` is now the one and only working copy.
Future sessions/IDE windows should be opened there, not at the old OneDrive path.

**Next:** Continue with Phase 1 (real trained model) from the new location —
nothing about the actual novelty-plan work changed, only where the files live.

---

## 2026-07-05 — Generalization gap addressed: Phase 2c added, continuous learning rejected

**Context:** User asked what guarantees the model gives correct results if someone
uploads real hospital MRI images (different scanners/protocols/populations than the
Kaggle training set), and separately asked whether the model could continuously
learn from every uploaded image to handle this.

**Did:**
- Explained the real causes of distribution shift for this project: scanner/protocol
  variation, preprocessing mismatch (current `ml_service.py:83-88` does a naive
  resize with no intensity normalization/windowing/skull-stripping), Kaggle dataset
  selection bias vs. real clinical variety, and the complete absence of any
  out-of-distribution detection (softmax always confidently picks one of 4 classes
  regardless of input).
- Evaluated continuous/live learning from user uploads and rejected it, for reasons
  now documented in `docs/NOVELTY_PLAN.md` Phase 2c: no ground truth at inference
  time (risk of a confirmation-bias feedback loop), catastrophic forgetting risk in
  naive online learning, and a real HIPAA/regulatory conflict (silently retraining
  on patient uploads without consent). Also noted this is why FDA-cleared models are
  version-locked and require a formal change-control process to update — continuous
  drift is treated as a safety risk in real medical AI, not a feature.
- Proposed the legitimate alternative — a human-in-the-loop pipeline (radiologist
  confirms/corrects → verified data accumulates → periodic re-validated retraining)
  — as something to *design and document*, not build as running code, and folded it
  into Phase 3's interview narrative.
- User selected two concrete, buildable mitigations: **external-dataset validation**
  (hold out a second, different public brain MRI dataset never used in training,
  report the real accuracy/metric drop as empirical evidence of the generalization
  gap) and **OOD/low-confidence flagging** (reuse Phase 2's uncertainty
  quantification to flag inputs the model isn't confident about, rather than always
  confidently answering).
- Added **Phase 2c** to `docs/NOVELTY_PLAN.md` with full rationale, sequenced after
  Phase 1 (needs a real trained model to evaluate) and alongside Phase 2 (shares the
  same uncertainty-quantification implementation). Updated Phase 3's narrative
  bullets and the status checklist accordingly.

**Decided:** No automatic/continuous retraining from user uploads, ever, in this
project. The honest position for the writeup: performance outside the training
distribution is unknown until measured (Phase 2c item 1), and the system is
designed to flag rather than hide that uncertainty (Phase 2c item 2) — not claim
validated real-world clinical accuracy, which this project cannot actually earn
without real hospital data and radiologist-confirmed ground truth.

**Next:** Still Phase 1 first (real trained model + honest metrics) before Phase
2/2b/2c work begins.

---

## 2026-07-05 — Fixed the existing (pre-revamp) deployment: it was fully broken

**Context:** Before starting the novelty-plan work, user wanted the *current,
unaltered* deployed site made accessible and working — the shared link
(`neural-path-fog279f00-...vercel.app`) hit a Vercel SSO login wall.

**Investigated and found multiple real, separate problems:**
1. The `-fog279f00-` URL is the raw per-deployment link, which Vercel protects
   with an SSO wall by default. The actual public entry point is the alias
   `https://neural-path-ai.vercel.app` (confirmed via `vercel project ls` /
   `vercel inspect`) — this alias itself was reachable (200 OK), so this part
   was a red herring, not a bug.
2. **Deploys were failing outright**: Vercel refused to build `next@15.1.6`
   (the version pinned in `frontend/package.json`) because of a disclosed
   vulnerability, CVE-2025-66478. Confirmed via `vercel deploy --prod --force`,
   which surfaced `"message": "Vulnerable version of Next.js detected"`.
3. Root-caused an earlier, separate anomaly (a stale production deployment
   from 2026-05-13 had actually built against **Next.js 16.2.6**, not the
   pinned 15.1.6) to a stale/reused Vercel build cache — a fresh, no-cache
   build correctly resolved 15.1.6 from the lockfile, ruling out a
   package.json/lockfile authoring error.
4. Fixed by upgrading `next` to `15.5.20` (latest stable 15.x, patched) and
   `eslint-config-next` to match, in `frontend/package.json`.
5. That surfaced a second real issue: `react`/`react-dom` were pinned to
   exactly `19.0.0`, which no longer satisfies `@clerk/nextjs@6.39.3`'s peer
   requirement (`^18.0.0 || ~19.0.3 || ~19.1.4 || ~19.2.3 || ~19.3.0-0`) once a
   fresh install pulled the latest compatible Clerk version. Fixed by bumping
   both to `19.0.3`.
6. Discovered `node_modules` was split inconsistently between the repo root
   and `frontend/` (the repo root is an npm workspace per root `package.json`),
   causing `react`/`next` to appear missing from `frontend/node_modules` even
   though workspace hoisting had placed them at the root — resolved with a full
   clean reinstall (`rm -rf node_modules frontend/node_modules`).
7. First redeploy attempt then failed differently: `Cannot find module
   '../lightningcss.linux-x64-gnu.node'` on Vercel's Linux build machine, even
   though `lightningcss-linux-x64-gnu` was listed in `package-lock.json`'s
   optionalDependencies. This is a known class of npm bug where a lockfile's
   platform-specific optional dependency resolution can go stale/incomplete.
   Fixed by deleting both `package-lock.json` files (there was also a stray
   duplicate one committed inside `frontend/`, alongside the root one — only
   the root one should exist, since this is an npm workspace) and
   regenerating fresh with npm 11.12.1.
8. After that fix, the build succeeded and `/predict` still returned 404 —
   but this turned out to be **correct behavior, not a bug**: Clerk's
   `auth.protect()` in `frontend/src/middleware.ts` defaults to rendering a
   404-shaped block page for unauthenticated visitors to a protected route,
   rather than redirecting to sign-in. Confirmed via response headers
   (`X-Clerk-Auth-Reason: protect-rewrite`, `X-Matched-Path: /404`).
9. Improved this UX on request: added `frontend/src/app/sign-in/[[...sign-in]]/
   page.tsx` (Clerk's prebuilt `<SignIn />` component) and updated
   `frontend/src/middleware.ts` to pass `unauthenticatedUrl` to
   `auth.protect()`, so unauthenticated visitors now get a real 307 redirect
   to `/sign-in` instead of a confusing 404.

**Verified end state (via curl against the live production URLs):**
- `https://neural-path-ai.vercel.app/` → 200 OK.
- `https://neural-path-ai.vercel.app/predict` (signed out) → 307 redirect to
  `/sign-in`.
- `https://neural-path-ai.vercel.app/sign-in` → 200 OK.
- Backend `https://neuralpath-ai.onrender.com/health` → 200,
  `{"status":"ok","model_loaded":true}` — confirmed the Render backend was
  never actually broken, just cold-starting (free tier spins down after
  inactivity; first request took ~9s, subsequent ones were fast). Its model is
  still the mock/untrained one — not addressed here, that's Phase 1's job.

**Also fixed while in here (housekeeping, not part of the deploy bug):**
- `.gitignore` was missing a root-level `node_modules/` exclusion (had
  `frontend/node_modules/` but not the root one, which exists because the repo
  root is an npm workspace) — added.
- Removed a stray, accidentally-tracked `frontend/build_output.log` and added
  it to `.gitignore`.
- Removed a duplicate `frontend/package-lock.json` that shouldn't have existed
  alongside the root lockfile in an npm-workspaces setup.

**Tools/access set up along the way:** installed the Vercel CLI globally,
authenticated (`vercel login`), linked the local `frontend/` directory to the
`neural-path-ai` Vercel project (`vercel link`). Confirmed some env vars
(`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`) are marked
"Sensitive" in Vercel and cannot be read back via CLI or dashboard by design —
this is expected Vercel behavior, not a misconfiguration, and wasn't a blocker
since Vercel's own build servers inject the real values at build time.

**Not yet done:** none of this touched the novelty-plan work (Phases 1-5) —
this was purely getting the pre-existing, already-built site back to a
genuinely working, demoable state before any new development starts. Changes
are made locally but not yet committed — awaiting user go-ahead to commit.

---

## 2026-07-05 — Full build schedule created; compliance/scalability scope added

**Context:** User starts a new internship tomorrow that requires an original
project built *during* the internship — this project is doing double duty as both
DeepHealth interview prep and the internship deliverable. Real interview is 3-6
months out; user wants to spend ~4-6 weeks on this build, ~3-5 hrs/day, at a
deliberate learning pace (theory alongside building), not rushed. Also clarified:
this is a **revamp** of an existing working app, not a from-scratch build — don't
treat it as day-zero. Two new cross-cutting requirements: the project should be
**HIPAA-aware** and have **scalable architecture**.

**Did:**
- Clarified compliance scope via question: chose "HIPAA-aware design practices" —
  not a certification claim (impossible for a solo demo app), but real practices:
  no PHI stored/logged, temp files already deleted post-inference
  (`backend/main.py:52-54`, confirmed this already exists — keep it), documented
  data handling, consistent "assistive tool" disclaimers, audit-trail-style
  prediction logging without ever logging images/identifying data.
- Clarified scalability scope: "code/architecture scalability" — stateless backend
  (already true), singleton model loading at startup (already true,
  `ml_service.py:124`), clean separation of concerns as new pieces are added,
  efficient batch processing if `/api/predict/batch` is revisited. Design
  decisions and talking points, not literal load testing or premature infra
  (e.g. no Kubernetes autoscaling for a demo app).
- Added a "Cross-cutting: compliance and scalability" section to
  `docs/NOVELTY_PLAN.md` — applied within each phase as it's built, not a separate
  phase.
- Created `docs/SCHEDULE.md`: a 6-week arc (Week 1: data + first real model, Week
  2: evaluation rigor + backend integration, Week 3: uncertainty quantification,
  Week 4: RAG chat, Week 5: compliance/scalability formalization + free-tier infra,
  Week 6: frontend polish + interview narrative + buffer), plus a detailed
  day-by-day breakdown for Week 1 (env setup/GPU check/dataset EDA → split design
  → data+model script → first training run → fine-tuning → preliminary eval +
  buffer), each day pairing a concrete task with a theory topic to learn
  alongside it.
- Updated root `CLAUDE.md` to point to `docs/SCHEDULE.md` alongside the existing
  plan/devlog references.

**Decided:**
- Schedule is explicitly a living plan, not a contract — expected to shift as
  training runs and learning take unpredictable amounts of time; revise
  `SCHEDULE.md` and note why in this log when that happens.
- Still no code written. Day 1 of Week 1 (environment setup, GPU verification,
  dataset download/EDA) is the first actual implementation work, starting
  tomorrow per the user's stated timeline.

**Next:** Day 1 of the schedule — set up training environment, verify GPU
visibility to TensorFlow, download and inspect the Kaggle Brain Tumor MRI Dataset.

---

## 2026-07-05 — Phase 1 planning: dataset, compute, architecture decided (no code yet)

**Context:** User asked to begin Phase 1 "as a proper dev" — systematically,
everything documented and justifiable — but explicitly clarified partway through:
this is still planning only, no code/implementation yet.

**Did:**
- Asked user to choose between the standard public Kaggle "Brain Tumor MRI Dataset"
  (masoudnickparvar, ~7000 images, 4 classes matching existing labels exactly) vs. a
  custom/own dataset. User chose the Kaggle dataset — citable, exact label match, no
  provenance ambiguity.
- Asked about compute (GPU vs CPU-only). User has an RTX 2050 (4GB VRAM) + Ryzen
  5000-series CPU and initially said "use your judgment." Based on the 4GB VRAM
  constraint, decided on **EfficientNetB0** (ImageNet-pretrained transfer learning,
  224×224 input, batch 16-32) — fits comfortably on 4GB at this batch size, unlike
  ResNet50/EfficientNetB3+ which risk OOM or force impractically small batches.
  Also a defensible, modern architecture choice to discuss in an interview rather
  than "biggest model I could run."
- Confirmed the model will be exported in a format servable by the existing
  `tensorflow-cpu` dependency already in `backend/requirements.txt` — training and
  serving environments stay consistent, no architecture mismatch.
- Recorded all of this in `docs/NOVELTY_PLAN.md` under Phase 1 as locked-in
  decisions, explicitly noting no implementation has happened yet.
- Started a todo list for Phase 1 execution steps (dataset acquisition → split →
  training script → training run → evaluation → backend integration → verification
  → documentation) — currently all pending, nothing started.

**Decided:** Still in planning mode. No dataset downloaded, no scripts written, no
training run. Everything above is a decision record, not a status update on
implementation.

**Next:** Awaiting explicit go-ahead from user before writing any code (data
loading script, training script, etc.).

---

## 2026-07-05 — Frontend polish scoped as Phase 5

**Context:** User wants the site to feel more dynamic/aesthetically pleasing, with an
explicit constraint: must not break existing functionality.

**Decided:** Sequence after Phase 1, not now. Rationale: interview scrutiny will hit
ML credibility first, and polishing the UI now means re-polishing after Phase 1
changes what's actually displayed (real model output, possibly Phase 2 uncertainty
ranges). Added as **Phase 5** in `docs/NOVELTY_PLAN.md` with an explicit approach for
later: incremental styling/motion changes only (not touching data-fetching or API
contracts), tested against the running dev server after each change, building on
existing frontend choices (Framer Motion, Three.js/@react-three/fiber, shadcn/ui,
next-themes) rather than introducing new UI libraries.

**Next:** Still Phase 1 first.

---

## 2026-07-05 — RAG scoped as Phase 2b; MCP and agentic AI ruled out

**Context:** User asked whether RAG, MCP servers, or agentic AI had any genuine use
case in this project.

**Did:**
- Evaluated each against the "would this be a real fix or just buzzword coverage"
  test used for the infra list:
  - **MCP servers**: no natural consumer in this codebase (backend isn't an MCP
    host) — would mean inventing a use case just to use the term. Ruled out
    entirely for this project.
  - **Agentic AI**: no multi-tool workflow to orchestrate in a single-classifier
    app; forcing an agent loop here would be the same red flag as unnecessary
    Helm charts. Ruled out beyond possibly simple tool-calling tied to RAG.
  - **RAG**: genuine fit. `backend/llm_service.py:66` (`radiologist_chat`) currently
    answers medical questions purely from Llama-3.1's parametric knowledge with no
    grounding/citations — a real hallucination-risk gap for a "Dr. NeuralPath"
    persona. Grounding it in a small curated medical corpus (WHO CNS tumor
    classification excerpts, public radiology reference text) via embeddings +
    FAISS/Chroma fixes an actual weakness and gives a legitimate interview talking
    point about hallucination risk in clinical LLM use.
- Added **Phase 2b** to `docs/NOVELTY_PLAN.md` for grounded RAG, sequenced after
  Phase 1/2 (it improves the LLM layer, not the classifier credibility gap Phase 1
  fixes first). Updated the status checklist.

**Decided:** Build RAG into the chat assistant as Phase 2b. Skip MCP and agentic
framing entirely for this project — not just deferred, ruled out as not fitting.

**Next:** Still Phase 1 first — pick dataset, write real training script, get honest
metrics on a held-out test set.

---

## 2026-07-05 — Sequencing decision + Phase 4 (infra) scoped

**Context:** User got unsolicited tooling advice via LinkedIn from two DeepHealth
employees — Puneet Sharma (senior DevOps: GCP/AWS/Docker/K8s-orchestration/CI-CD/
Helm/ArgoCD/Octopus Deploy/service mesh) and Jeevan Kumar (full-stack: DeepHealth
uses Node/React/AWS/Firebase/SQL/Postgres, but "don't need to know everything, master
something you'll be proud of"). Asked for a plan to fold in the relevant pieces
without making the project feel like a fake checklist.

**Did:**
- Triaged the tooling list into: ignore (GCP, Helm/ArgoCD/Octopus/service mesh/full
  k8s — platform-team territory, would read as padding on a solo AI portfolio
  project), genuinely useful (Docker — already present, harden it; one CI/CD tool —
  GitHub Actions; a real DB only if there's a natural use case — replacing
  localStorage scan history with Postgres).
- Confirmed with user: free-tier AWS only, no spend. Ruled out ECS Fargate (no
  meaningful free tier, billed per vCPU/memory-second from second one). Settled on
  EC2 (`t2.micro`/`t3.micro`, 750 hrs/mo free for 12 months) + S3 (model artifact,
  5GB free) + ECR (image storage, 500MB free) + GitHub Actions for build/push.
  Flagged a real risk: TF-CPU + OpenCV on 1GB RAM (t2.micro) may OOM once a real
  model is in place — t3.micro is the fallback, not a paid instance.
- User decided sequencing: ML credibility (Phase 1/2) comes first; infra (Phase 4)
  gets folded in opportunistically alongside/after, not as a blocker. Any other new
  feature ideas get deferred until later.
- Updated `docs/NOVELTY_PLAN.md` with a new Phase 4 section (scope, rationale, what's
  explicitly excluded and why) and added it to the status checklist.
- Created root `CLAUDE.md` (previously only `frontend/CLAUDE.md` → `AGENTS.md`
  existed, which only covers a Next.js version warning). Root file documents project
  structure, the known ML-credibility issues so future sessions don't mistake the
  mock model for real, run commands, and working conventions (prioritize honesty/
  rigor over impressive-looking output; log work in DEVLOG.md after sessions).

**Decided:**
- Phase ordering is fixed: 1 → 2 → 3, with 4 (infra) interleaved opportunistically,
  not before 1/2 are done.
- Infra scope is deliberately minimal and free-tier only — no Kubernetes, no GCP, no
  paid AWS services.

**Next:** Begin Phase 1 — pick/confirm a real brain tumor MRI dataset, write a real
training script/notebook, train an honest baseline, report metrics (accuracy,
per-class precision/recall, confusion matrix) on a held-out test set.

---

## 2026-07-05 — Codebase audit + plan

**Context:** User wants to make this project genuinely novel (not just polished) ahead
of a DeepHealth AI interview.

**Did:**
- Read `backend/ml_service.py`, `backend/main.py`, `backend/llm_service.py`,
  `model/generate_mock_model.py`, `backend/requirements.txt`.
- Confirmed the shipped model (`VGGSKin.h5`) is generated by
  `generate_mock_model.py` — an untrained, randomly-initialized network — not a real
  trained classifier. No training script, dataset, or evaluation metrics exist anywhere
  in the repo.
- Confirmed the inference pipeline: 128×128 resize → softmax classification → Grad-CAM
  heatmap (real implementation, `backend/ml_service.py:30-65`) → templated text report
  → separate Groq Llama-3.1 call that rephrases the label as a formatted "radiology
  report" and powers a chat assistant. The LLM has no access to the image/heatmap.
- Wrote `docs/NOVELTY_PLAN.md` capturing the assessment and a 3-phase plan: (1) real
  trained model + honest metrics, (2) one rigorous differentiator — leaning toward
  calibrated uncertainty quantification (MC-dropout / conformal prediction) over raw
  softmax confidence, (3) interview narrative prep (sensitivity/specificity trade-offs,
  Grad-CAM limitations, what production-grade validation would require).
- Created this dev log for ongoing documentation.

**Decided:**
- Stay in the brain-MRI domain rather than pivoting to breast imaging (DeepHealth's
  actual domain) — less rework, and the plan is to make the *methodology* transferable
  rather than the dataset.
- Not writing code yet — user asked to strategize first before implementation.

**Next:** Awaiting user direction on which phase to start implementing first.
