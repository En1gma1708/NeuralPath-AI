"use client";

import { useRef } from "react";
import { Navbar } from "@/components/Navbar";
import { PageHero } from "@/components/explainability/PageHero";
import { ExpandSection } from "@/components/explainability/ExpandSection";
import { StatGrid } from "@/components/explainability/StatGrid";
import { ScrollStageRail } from "@/components/explainability/ScrollStageRail";

const STAGES = [
  { eyebrow: "Stage 1", title: "Classification — EfficientNetB0" },
  { eyebrow: "Stage 2", title: "Uncertainty — MC-Dropout" },
  { eyebrow: "Stage 3", title: "Explainability — Grad-CAM" },
  { eyebrow: "Stage 4", title: "Grounded chat — RAG + tool calling" },
];

export default function ArchitecturePage() {
  const stagesRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 pb-24 max-w-5xl">
        <PageHero
          eyebrow="Architecture"
          title="How the pipeline actually works"
          description="Four stages, each with a specific job: classify the scan, quantify how sure the model actually is, show where it looked, and ground any follow-up explanation in real medical references."
        />

        <StatGrid
          stats={[
            { value: "4.05M", label: "Total model parameters" },
            { value: "30", label: "MC-Dropout forward passes per prediction (local default)" },
            { value: "22", label: "RAG corpus chunks, real sourced medical references" },
            { value: "3", label: "Tool-calling functions available to the chat assistant" },
          ]}
        />

        <div className="mt-16 flex gap-12">
          <ScrollStageRail stages={STAGES} containerRef={stagesRef} />
          <div ref={stagesRef} className="flex-1 min-w-0">
          <ExpandSection eyebrow="Stage 1" title="Classification — EfficientNetB0" defaultOpen>
            <p>
              A pretrained EfficientNetB0 backbone with a custom classification head,
              trained in two passes: first with the base frozen (only the new head
              trains), then fine-tuned with the top blocks (block6 onward) unfrozen at a
              100x lower learning rate. The fine-tuning pass alone improved held-out test
              accuracy by 6.30 points (88.12% → 94.42%) — most of the model's real
              capability comes from that second pass, not the initial frozen-base
              training.
            </p>
            <p>
              Trained on a leakage-safe split (5,040 train / 1,066 val / 1,094 test
              images) built by clustering perceptual duplicates first — the original
              Kaggle split had ~12% of files duplicated across train and test, which
              would have silently inflated any accuracy number measured against it.
            </p>
          </ExpandSection>

          <ExpandSection eyebrow="Stage 2" title="Uncertainty — MC-Dropout">
            <p>
              The classification head already has a Dropout(0.3) layer. MC-Dropout
              reuses it at inference time: instead of one forward pass, the model runs
              30 stochastic passes with dropout forced active, and the spread across
              those 30 predictions becomes a predictive-entropy uncertainty score.
            </p>
            <p>
              This is validated, not assumed: incorrect predictions show 7.17× higher
              predictive entropy than correct ones on the held-out test set — a real,
              usable signal, not a cosmetic confidence number. The trade-off is honest
              too — 30 sequential CPU passes add roughly 18× latency (0.79s → ~14-15s
              per prediction), which is why the deployed instance runs a
              memory-constrained 10 passes instead of 30 (see the Results page for the
              full incident that motivated that change).
            </p>
          </ExpandSection>

          <ExpandSection eyebrow="Stage 3" title="Explainability — Grad-CAM">
            <p>
              Grad-CAM (Gradient-weighted Class Activation Mapping) highlights which
              regions of the input image most influenced the model's prediction, using
              gradients flowing into the final convolutional layer (EfficientNetB0's
              <code className="mx-1 px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-xs">top_conv</code>
              layer).
            </p>
            <p>
              What it proves: spatial attention in that final layer. What it doesn't:
              it isn't causal, it's resolution-limited, and it has never been validated
              against radiologist-annotated ground truth in this project. It's a useful
              diagnostic aid for understanding the model, not proof the model is looking
              at the right anatomical feature for the right reason.
            </p>
          </ExpandSection>

          <ExpandSection eyebrow="Stage 4" title="Grounded chat — RAG + tool calling">
            <p>
              The chat assistant answers follow-up questions about a prediction using
              three tools it can call on its own: one that explains the real uncertainty
              value against this model's actual calibration numbers, one that retrieves
              from a small corpus of real, sourced medical references (StatPearls,
              RadiologyInfo.org — not fabricated), and one that reports the real external
              validation numbers.
            </p>
            <p>
              This is deliberately narrow: it grounds the assistant's answers about its
              own outputs, not a general autonomous agent loop. A grounded answer isn't
              necessarily more <em>correct</em> than an ungrounded one — well-established
              medical facts are often already in a base model's training data — but it's
              always more <em>verifiable</em>, since every claim traces to a citable
              source instead of an unlabeled parametric guess.
            </p>
          </ExpandSection>
          </div>
        </div>
      </main>
    </div>
  );
}
