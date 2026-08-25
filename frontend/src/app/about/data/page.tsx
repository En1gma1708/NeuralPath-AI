"use client";

import { useRef } from "react";
import { Navbar } from "@/components/Navbar";
import { PageHero } from "@/components/explainability/PageHero";
import { ExpandSection } from "@/components/explainability/ExpandSection";
import { StatGrid } from "@/components/explainability/StatGrid";
import { ScrollStageRail } from "@/components/explainability/ScrollStageRail";

const STAGES = [
  { eyebrow: "Training data", title: "A leakage-safe split, rebuilt from scratch" },
  { eyebrow: "External validation", title: "Four independently-sourced datasets" },
  { eyebrow: "The honest finding", title: "A 25.97-point generalization gap" },
  { eyebrow: "What was tried", title: "Sourcing more training data" },
];

export default function DataPage() {
  const stagesRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 pb-24 max-w-5xl">
        <PageHero
          eyebrow="Data & Methodology"
          title="Where the data came from, and what it actually proves"
          description="Training data is only half the story. The more revealing test is what happens when the model sees data it has never encountered from a source it was never trained on."
        />

        <StatGrid
          stats={[
            { value: "7,200", label: "Total images, original Kaggle dataset" },
            { value: "12%", label: "Files removed as train/test duplicate leakage" },
            { value: "4", label: "Independently-sourced external validation datasets" },
            { value: "21.59 pts", label: "Generalization gap, after mitigation (from 25.97)" },
          ]}
        />

        <div className="mt-16 flex gap-12">
          <ScrollStageRail stages={STAGES} containerRef={stagesRef} />
          <div ref={stagesRef} className="flex-1 min-w-0">
          <ExpandSection eyebrow="Training data" title="A leakage-safe split, rebuilt from scratch" defaultOpen>
            <p>
              The base dataset (Kaggle Brain Tumor MRI, 7,200 images across 4 balanced
              classes) ships with its own train/test split — but checking it directly
              with perceptual hashing found 294 near-duplicate clusters, 855 files
              (~12%) spanning both sides of that split. Using it as-is would have
              silently inflated test accuracy with images the model had effectively
              already seen.
            </p>
            <p>
              The split was rebuilt with cluster-stratified sampling (seed=42): 5,040
              train / 1,066 val / 1,094 test, with every perceptual-duplicate group kept
              entirely on one side of the split. All accuracy numbers on this site are
              measured against that rebuilt split, not the original.
            </p>
          </ExpandSection>

          <ExpandSection eyebrow="External validation" title="Four independently-sourced datasets, one per class">
            <p>
              No single public dataset covers all four classes with verifiably
              independent provenance from the training data, so external validation uses
              a composite of four separately-sourced, single-class collections — each
              checked directly against its own citation trail for lineage overlap with
              the training data, not assumed independent from the absence of evidence.
              Several plausible-looking candidates were ruled out this way, including one
              2026 peer-reviewed dataset that looked independent until its own citations
              were traced.
            </p>
            <ul>
              <li><strong>Glioma</strong> — TCIA UPENN-GBM (100 patients, T1 post-contrast)</li>
              <li><strong>Meningioma</strong> — BraTS Meningioma via Synapse, mask-guided slice selection (100 patients, T1-CE)</li>
              <li><strong>No tumor</strong> — IXI Dataset (100 subjects, T1)</li>
              <li><strong>Pituitary</strong> — OpenNeuro ds006248, coronal T1-CE (50 patients)</li>
            </ul>
          </ExpandSection>

          <ExpandSection eyebrow="The honest finding" title="A 25.97-point generalization gap">
            <p>
              Run unmodified against this external set, the model scored 68.45% —
              25.97 points below its 94.42% held-out test accuracy. That gap is the
              actual headline finding of this project's evaluation work, not something
              smoothed over: a model that looks excellent on in-distribution data can
              still fail meaningfully on data from a different scanner, protocol, or
              patient population.
            </p>
            <p>
              Digging further surfaced something worse than an accuracy gap: real
              miscalibration. On the external set, the model is <em>more</em> confident
              (91.9%) when wrongly calling a meningioma "no tumor" than when correctly
              identifying one (84.5%) — the exact failure mode where confident-but-wrong
              is most dangerous. A calibrated decision-rule mitigation (requiring the
              no-tumor class to clear a higher bar before winning) recovered some of
              this — external accuracy to 73.40%, gap to 21.02 points — but it's
              explicitly disclosed as a partial fix, not a solved problem: even with the
              mitigation active, 66% of tumors the model would have called "no tumor"
              are still missed.
            </p>
          </ExpandSection>

          <ExpandSection eyebrow="What was tried, and what wasn't worth it" title="Sourcing more training data — a real, disclosed limitation">
            <p>
              After finding the gap, the natural next step is more/varied training data.
              This was pursued seriously: a second sourcing pass found viable
              independent data for pituitary (successfully merged — see the Results
              page for the retrain outcome), but glioma and no-tumor sourcing hit
              genuine dead ends — TCIA's restricted-license gate, a fully decommissioned
              HCP data portal, and a scanner-era domain-shift risk (1.5T/2007-era data)
              too significant to respsonsibly ignore for a public-data-only,
              no-institutional-access student project.
            </p>
            <p>
              Meningioma's training data has no viable independent source at all —
              every candidate either shares the existing training lineage or is
              gated behind formal institutional access. This asymmetry (only pituitary
              improved) is disclosed directly rather than glossed over, because it's a
              real constraint on how far this specific gap could be closed without
              institutional resources.
            </p>
          </ExpandSection>
          </div>
        </div>
      </main>
    </div>
  );
}
