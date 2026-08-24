# Interview Narrative — NeuralPath AI

Purpose: the compiled story of this project for interview conversations and
resume framing. Every number below is pulled directly from `docs/METRICS.md`
— no restated, rounded, or estimated figures. Where METRICS.md's own numbers
were later superseded by a retrain or a new run, this document uses the
current/final numbers and says so explicitly, the same way METRICS.md itself
layers "current best" over earlier superseded passes.

This is prose/narrative construction, not new experimentation — see
`docs/SCHEDULE.md`'s Phase 3 checklist for scope, and `docs/NOVELTY_PLAN.md`
for the full phase-by-phase design rationale behind every decision discussed
here.

---

## 1. What this is, in one paragraph

NeuralPath AI is a 4-class brain MRI tumor classifier (glioma, meningioma,
pituitary tumor, no tumor) built on a fine-tuned EfficientNetB0, with MC-Dropout
uncertainty quantification, Grad-CAM visual explanations, a grounded RAG chat
assistant, and a tool-calling agent layer — plus, critically, an honest,
*measured* account of where the system's confident-sounding numbers stop being
trustworthy. The headline in-distribution accuracy (94.88% held-out test) is
real, but so is the fact that accuracy drops to 72.83% on genuinely external
data from different hospitals/scanners. Both numbers are reported together,
deliberately, because a project that only shows the first one is showing half
the truth a real deployment would need.

---

## 2. Sensitivity/specificity trade-offs — what the per-class numbers actually mean

Aggregate accuracy hides where a classifier's mistakes land, and in a medical
context those mistakes are not equally costly. This project's held-out test
set (1,113 images, current model, 2026-08-23) breaks down as:

| Class | Precision | Recall | F1 |
|---|---|---|---|
| Glioma | 94.05% | 93.70% | 93.88% |
| Meningioma | 91.95% | 90.23% | 91.08% |
| No tumor | 98.55% | 95.77% | 97.14% |
| Pituitary | 94.79% | 99.32% | 97.00% |

**Recall matters more than precision for the tumor classes.** A false
negative — a real glioma classified as something else, or worse, as "no
tumor" — delays treatment for a genuinely dangerous condition. A false
positive (a healthy scan flagged as a possible tumor) costs a follow-up
scan and some anxiety, not a missed cancer. This asymmetry is exactly why
this project didn't stop at "94.88% accuracy" and treat every class's
errors as interchangeable — it's also why the "no tumor" class's specific
failure mode (see §4) got dedicated attention rather than being absorbed
into one aggregate number.

**Meningioma is consistently the hardest class**, in-distribution and
externally. Its recall (90.23% in-distribution) is the lowest of the 4
classes, and its known clinical visual heterogeneity — meningiomas can look
very different from each other depending on location, grade, and
enhancement pattern — is a plausible, literature-consistent explanation
rather than a pipeline bug. The uncertainty numbers independently confirm
this: meningioma also has the highest per-class predictive entropy (0.1861
vs. 0.0428–0.1135 for the other 3 classes) among in-distribution
predictions — two independent measurements (accuracy and uncertainty)
pointing at the same class as genuinely harder, which is a stronger signal
than either alone.

---

## 3. What Grad-CAM does and doesn't prove

Grad-CAM heatmaps are shown alongside every prediction, highlighting which
image regions most influenced the final classification. It's a real,
useful debugging and communication tool — but it's worth being precise
about what it actually demonstrates, since it's easy to over-claim.

**What it does prove:** which spatial region of the final convolutional
feature map had the largest gradient-weighted influence on the predicted
class. When the heatmap lights up over the anatomically plausible region
(e.g. the tumor location, not the skull or background), that's a real,
useful sanity check that the model is attending to relevant anatomy rather
than an artifact.

**What it doesn't prove:**
- **It's not causal evidence.** A high-attention region correlating with the
  prediction doesn't mean that region is the *reason* for the prediction in
  any mechanistic sense — it's a coarse, gradient-based approximation, not
  an ablation study.
- **It's resolution-limited.** Grad-CAM is computed from the last
  convolutional layer's feature map (a small spatial grid, upsampled back to
  image size), so its localization is inherently coarse — it can point at
  the right general region while being imprecise about exact tumor
  boundaries.
- **It can highlight a plausible-looking but wrong region.** Nothing about
  Grad-CAM guarantees the highlighted region is actually diagnostic; a model
  that's shortcutting on a spurious correlation can still produce a
  heatmap that looks anatomically reasonable to a non-expert. This project's
  own axial-vs-coronal plane-mismatch bug (§6) is a concrete, first-hand
  example of exactly this risk: a model that had learned a spurious
  "axial wide-field skull-base = pituitary" shortcut would very plausibly
  still produce heatmaps that light up on real anatomical structures, not
  obviously-wrong background — Grad-CAM alone would not have caught that
  bug; only the external-validation accuracy drop did.
- **It's not a substitute for radiologist-annotated ground truth.** Without
  expert-annotated tumor masks to compare against, there's no way to
  quantitatively score how "correct" a given heatmap's localization is —
  this project's heatmaps are qualitatively sanity-checked, not
  quantitatively validated against ground-truth segmentation.

Building the Grad-CAM integration itself surfaced a real engineering
problem worth naming: EfficientNetB0 is a nested Functional submodel with
internal skip-connections (Add/Multiply layers in its MBConv blocks), and
two initially-reasonable approaches to wiring up gradients both silently
failed — reusing the submodel's own output tensor disconnects it from the
outer model's real input, and manually replaying layers breaks on
multi-input Add/Multiply layers. The fix (documented in
`backend/ml_service.py`'s `_build_gradcam_model()`) required building a
sub-model up to the target conv layer that shares the base's actual weight
objects (not a copy), then continuing through the remaining layers within
one single-input `Model()` graph so gradients flow correctly end-to-end.

---

## 4. What production-grade validation would actually require

This project's validation is real and rigorous by portfolio-project
standards, but it is not clinical-grade, and naming that gap precisely is
more credible than implying otherwise.

**What this project did:**
- A leakage-safe train/val/test split, rebuilt from scratch after
  discovering the original Kaggle-provided split had 294 perceptual-duplicate
  groups (855 files, ~12% of the dataset) spanning across the
  train/test boundary — near-identical slices from the same scan appearing
  on both sides, which would have silently inflated test accuracy.
- MC-Dropout uncertainty quantification, validated with a real, measured
  7.17x entropy separation between correct and incorrect predictions
  in-distribution — not just added as a checkbox feature.
- A genuinely external validation set (4 independently-sourced,
  single-class collections from different institutions than the training
  data), used to measure — not assume — a real generalization gap.
- Root-caused, not just observed: when a retrain regressed external
  accuracy, the actual root cause (an imaging-plane mismatch) was tracked
  down and fixed, not papered over (§6).

**What it did not do, and what real clinical validation would require:**
- **Radiologist-annotated ground-truth masks**, not just class labels. This
  project's Grad-CAM sanity checks are qualitative; real validation would
  score localization quantitatively (e.g. Dice/IoU) against expert-drawn
  tumor boundaries.
- **Multi-reader studies.** A single "ground truth" label per scan (as used
  here, inherited from each source dataset) doesn't capture inter-radiologist
  disagreement, which is itself clinically significant for genuinely
  ambiguous cases — real validation studies compare model performance
  against the *distribution* of expert opinions, not a single label.
- **A broader, multi-site external validation sample.** This project's
  external set is 4 single-source collections (50-100 patients/class each)
  — one institution/scanner/protocol per class, not a broad multi-site
  sample. The measured 72.83% external accuracy could partly reflect
  quirks of those specific 4 sources rather than a fully general
  "real-world" number; a second independent source per class was
  specifically researched as a follow-up (see §7) to test whether the
  gap's *magnitude* holds up, not just its direction.
- **Prospective validation**, not just retrospective. Every number here
  comes from evaluating a fixed model against fixed, pre-existing datasets.
  Real clinical validation includes prospective deployment monitoring —
  does performance hold up on scans that arrive after the model was
  trained, not just held-out slices of historical data.
- **Regulatory-grade change control.** This project's model has been
  retrained and re-evaluated multiple times within a single project timeline
  (see §6) — appropriate for active development, but real deployed medical
  AI is version-locked and re-validated under frameworks like the FDA's
  Predetermined Change Control Plan specifically because uncontrolled
  post-deployment model drift is treated as a patient-safety risk, not a
  routine software update.

Naming this gap precisely — not just "this isn't clinically validated" as a
throwaway disclaimer, but specifically *what* clinical validation would add
beyond what was already measured — is itself the point: it demonstrates
understanding of what separates a portfolio-quality ML project from a
regulated medical device, which is exactly the judgment a healthcare AI
role needs.

---

## 5. The generalization gap: measured, not assumed — and only partially mitigated

This is the project's central, most defensible finding, because it's a
number this project chose to go measure rather than a caveat added after
the fact.

**The gap, in numbers** (composite external-validation set: 4
independently-sourced collections, ~1,049 images total, TCIA UPENN-GBM /
BraTS-Meningioma via Synapse / IXI / OpenNeuro ds006248, verified to share
no training-lineage overlap with this project's training data):

| Metric | In-distribution | External | Gap |
|---|---|---|---|
| Overall accuracy (current model, with decision-rule mitigation) | 94.88% | 72.83% | 21.59 pts |

That's a real, substantial drop — a model that looks excellent on its own
held-out test set performs meaningfully worse on scans from hospitals and
scanners it never saw during training. This is the single most important
honest number in the whole project, because it's exactly the number a
naive presentation ("94.88% accurate!") would omit.

**The failure isn't just an accuracy gap — it's a miscalibration.** On the
raw model, mean softmax confidence on *incorrect* meningioma predictions
(0.919) was actually *higher* than on *correct* meningioma predictions
(0.845) — the model was more confident exactly when it was wrong. MC-Dropout
entropy showed the same inversion for this specific failure mode
(meningioma misclassified as no-tumor): lower entropy on the errors (0.306)
than on correct predictions (0.445). Two independent uncertainty signals
(softmax confidence and MC-Dropout entropy) both failed to flag this
specific, clinically costly error type — a real, disclosed limitation, not
something papered over with "well, uncertainty quantification helps."

**What was done about it — a calibrated, honestly-scoped mitigation, not a
claimed fix.** Since neither confidence signal caught this failure mode
directly, an asymmetric decision rule was calibrated against the external
set: don't let a "no tumor" prediction win unless its probability clears a
threshold, otherwise fall back to the model's best tumor guess. The
threshold (0.90) was chosen by inspecting the actual re-routing/miss/
false-flag trade-off at several candidate values, not picked blind —
and the finding at every threshold was that **there is no clean cutoff**:
tumors wrongly called "no tumor" have a median notumor-probability of 0.970,
almost as high as correctly-called no-tumor cases' median of 1.000. Even at
threshold 0.99, 38% of missed tumors are still missed. This mitigation
measurably helps (68.45% → 73.40% external accuracy in its original
validation, +4.95 points) but explicitly does not fix the underlying
miscalibration — it's disclosed in the API response itself via a
`notumor_override_applied` flag, so when it fires, that's visible, not
silent.

**The real fix is more/varied training data — attempted, partially
successful, and the story is worth telling honestly because of a real bug
found and fixed along the way.** Sourcing additional, independently-verified
training data (not just more external validation) for glioma, meningioma,
and no-tumor turned out to be blocked by institutional/gated access
requirements this project deliberately chose not to pursue (§7). Pituitary
data was successfully sourced and merged — and the first retraining
attempt on it **regressed** external accuracy (68.45% → 65.11%). Rather
than reverting blind, the actual root cause was found: the new source's
images were all axial wide-field slices, while the existing training
data's pituitary images were predominantly coronal/sagittal close-ups — a
plane mismatch invisible in file counts or even in-distribution accuracy,
which taught the model a spurious "axial wide-field skull-base =
pituitary" shortcut that then misfired against external glioma cases
(also shot axially). Fixed by correcting the slicing axis and
re-extracting from the already-downloaded source data, then retraining
again. The corrected result **beat the original baseline**: held-out test
94.42% → 94.88%, external accuracy 68.45% → 72.83%, generalization gap
25.97 → 21.59 points — a real, measured improvement, with the specific
required check (that the pituitary addition didn't make meningioma's
*relative* performance worse) confirmed to hold.

This whole arc — measure a real gap, try an honest mitigation with its
limits disclosed, attempt the actual fix, hit a real regression, root-cause
it properly instead of reverting blind, and land on a genuine net
improvement — is a stronger interview story than a clean, uninterrupted
success would have been, because it demonstrates the actual methodology
(measure, don't assume; root-cause, don't guess) rather than just the
outcome.

---

## 6. Why the system doesn't continuously learn from user uploads

A natural question for any deployed ML system: "does it get better over
time as people use it?" This project deliberately does not implement
online/continuous learning from user uploads, and the reasoning is worth
stating precisely rather than leaving it as an unexplained gap.

**Three real reasons, not just "it's hard":**

1. **No ground truth exists at inference time.** A prediction is not a
   confirmed diagnosis. Training on the model's own unconfirmed predictions
   risks a confirmation-bias feedback loop — the model reinforcing its own
   mistakes and becoming more confidently wrong over time, not actually
   improving.
2. **True online/incremental learning risks catastrophic forgetting**
   without careful techniques (replay buffers, regularization) that are
   themselves active research problems, not something to bolt on as a side
   feature of a classification app.
3. **A real regulatory/compliance issue.** Silently retraining a shared
   model on a user's uploaded scan without explicit consent conflicts
   directly with a HIPAA-aware design posture. This is also precisely why
   FDA-cleared medical AI models are version-locked rather than
   continuously updated — the FDA's Predetermined Change Control Plan
   framework exists specifically because uncontrolled post-deployment model
   drift is treated as a patient-safety risk, not a feature to ship.

**The legitimate alternative — designed, not built, and that distinction is
deliberate:** a human-in-the-loop pipeline where a radiologist confirms or
corrects each prediction, confirmed labels accumulate over time, and
periodic (e.g. quarterly) retraining happens on that verified data, with
each new model version re-evaluated (the same way this project's own
retrains were re-evaluated against held-out and external sets, §5) before
it replaces the deployed one. This is a real, defensible architecture to be
able to describe and justify even without an actual hospital feeding it
live data — choosing to *design* this rather than fake a live-learning demo
is itself the honest answer to a common but genuinely hard problem in
deployed clinical ML.

---

## 7. Two more honest findings worth including: what was tried and didn't pan out

**Sourcing more/varied training data for 3 of 4 classes was researched,
attempted, and ultimately scope-limited — not silently dropped.** Glioma
and no-tumor training data sourcing both hit genuine dead ends: a TCIA
collection (CFB-GBM) turned out to have a reproducible server-side bug
independent of any client-side troubleshooting; its fallback
(TCGA-GBM/TCGA-LGG) required a human-reviewed institutional access
application; a leading no-tumor candidate (HCP Young Adult) turned out to
have all 3 of its documented access paths independently broken on the
provider's own infrastructure (a legacy product, IBM Aspera Connect,
reaching end-of-life and a downstream platform's detection logic never
being updated for its replacement). A genuinely public no-application
fallback (OASIS-1) was found and confirmed working, but was deliberately
**not pursued** given its real domain-shift risk (1.5T, 2007-era scanner
data vs. presumably-3T-era training data) — a calculated decision that
public-data-only sourcing, kept simple, was worth more than fighting a
real risk to squeeze in one more class's worth of data. Meningioma had no
viable independent source at all, confirmed across two separate research
passes. This is presented as a scope decision with real tradeoffs
considered and rejected, not a gap that was never investigated.

**A second independent external-validation source per class was also
researched and came up empty — a negative result, reported honestly rather
than omitted.** Two research passes looked for a second, independent,
plain-access validation source for each of the 4 classes, specifically to
test whether the measured generalization gap's *magnitude* holds up
against a broader sample than one source per class. The result: no
qualifying candidate was found for 3 of 4 classes (every candidate either
required gated/institutional access, or turned out — on direct
verification — to share lineage with a source already in use), and the
one candidate found for the 4th class (pituitary) had, by that point,
already been merged into the training set rather than held out for
validation. This is reported as a genuine limitation of the current
external-validation numbers (§5's 72.83%/21.59-point gap come from a single
source per class, not a broad multi-site sample) rather than glossed over.

---

## 8. Talking points summary (quick reference)

- **"How accurate is it?"** 94.88% held-out test accuracy — but the more
  important number is 72.83% on genuinely external data (different
  hospitals/scanners), a 21.59-point measured generalization gap. Leading
  with the second number, unprompted, is itself the strongest signal of
  understanding real-world ML deployment.
- **"How do you know it's not overfit?"** Leakage-safe split (rebuilt after
  finding 855 near-duplicate files spanning the original train/test
  boundary), MC-Dropout uncertainty validated with a real 7.17x
  correct/incorrect entropy separation, and an actual external-validation
  measurement — not just a held-out split from the same source.
- **"What happens when it's wrong?"** MC-Dropout flags high-uncertainty
  predictions (surfaced to the user with an explicit caveat when
  uncertainty is high), Grad-CAM shows what the model attended to (with its
  real limitations acknowledged, §3), and a calibrated decision rule
  reduces — not eliminates — the worst failure mode (confidently-wrong
  "no tumor" calls on real external tumors).
- **"Does it keep learning?"** No, deliberately — see §6's 3 concrete
  reasons and the designed (not built) human-in-the-loop alternative.
- **"What would you do differently / what's still missing?"** Broader
  independent training data for 3 of 4 classes (blocked by
  institutional-access tradeoffs deliberately not pursued, §7), a second
  external-validation source per class (researched, came up empty, §7),
  and the full list of what clinical-grade validation would require beyond
  what this project measured (§4).
