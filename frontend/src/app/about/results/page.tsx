"use client";

import { useRef } from "react";
import { Navbar } from "@/components/Navbar";
import { PageHero } from "@/components/explainability/PageHero";
import { ExpandSection } from "@/components/explainability/ExpandSection";
import { StatGrid } from "@/components/explainability/StatGrid";
import { ScrollStageRail } from "@/components/explainability/ScrollStageRail";

const STAGES = [
  { eyebrow: "Classification", title: "Per-class performance" },
  { eyebrow: "External validation", title: "In-distribution vs. real-world" },
  { eyebrow: "Uncertainty", title: "MC-Dropout calibration" },
  { eyebrow: "Infrastructure", title: "Deployed instance incident" },
];

function MiniTable({ rows, headers }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto -mx-1 my-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h) => (
              <th key={h} className="text-left font-mono text-xs uppercase tracking-wide text-muted-foreground py-2 px-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-2 text-foreground tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ResultsPage() {
  const stagesRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 pb-24 max-w-5xl">
        <PageHero
          eyebrow="Results & Metrics"
          title="Every number here traces to a real run"
          description="Sourced from docs/METRICS.md — no rounded-up estimates, no vibes-based claims. If a number changed between phases, the before/after is shown, not just the latest value."
        />

        <StatGrid
          stats={[
            { value: "94.88%", label: "Held-out test accuracy" },
            { value: "94.84%", label: "Macro-avg precision, held-out test" },
            { value: "0.79s", label: "Base inference latency (no MC-Dropout)" },
            { value: "907MB", label: "Deployed Docker image size" },
          ]}
        />

        <div className="mt-16 flex gap-12">
          <ScrollStageRail stages={STAGES} containerRef={stagesRef} />
          <div ref={stagesRef} className="flex-1 min-w-0">
          <ExpandSection eyebrow="Classification" title="Per-class performance (held-out test, 1,113 images)" defaultOpen>
            <MiniTable
              headers={["Class", "Precision", "Recall", "F1"]}
              rows={[
                ["Glioma", "94.05%", "93.70%", "93.88%"],
                ["Meningioma", "91.95%", "90.23%", "91.08%"],
                ["No tumor", "98.55%", "95.77%", "97.14%"],
                ["Pituitary", "94.79%", "99.32%", "97.00%"],
              ]}
            />
            <p>
              Meningioma remains the hardest class — consistent with its known clinical
              visual heterogeneity, not a fixable pipeline issue. It's also the class
              with the highest predictive entropy under MC-Dropout, a coherent,
              independently-confirmed signal rather than noise.
            </p>
          </ExpandSection>

          <ExpandSection eyebrow="External validation" title="In-distribution vs. real-world performance">
            <MiniTable
              headers={["Metric", "Raw model", "With decision rule"]}
              rows={[
                ["External accuracy", "68.45%", "73.40%"],
                ["Generalization gap", "25.97 pts", "21.02 pts"],
                ["Glioma recall", "49%", "59%"],
                ["Meningioma recall", "41%", "49%"],
              ]}
            />
            <p>
              The decision-rule mitigation is a calibrated, disclosed partial fix — not
              a claim of solving the underlying gap. Full methodology on the Data page.
            </p>
          </ExpandSection>

          <ExpandSection eyebrow="Uncertainty" title="MC-Dropout calibration">
            <MiniTable
              headers={["Metric", "In-distribution", "External (shifted)"]}
              rows={[
                ["Entropy separation (incorrect / correct)", "7.17×", "2.45×"],
                ["Mean entropy, correct predictions", "0.0773", "—"],
                ["Mean entropy, incorrect predictions", "0.5542", "—"],
              ]}
            />
            <p>
              The signal degrades under distribution shift but doesn't vanish at the
              aggregate level — though for the specific, most costly meningioma→no-tumor
              failure mode, it's <em>not</em> a reliable safety net, a limitation stated
              directly rather than smoothed into the aggregate number.
            </p>
          </ExpandSection>

          <ExpandSection eyebrow="Infrastructure" title="Deployed instance — a real incident, found and fixed">
            <MiniTable
              headers={["Metric", "Value"]}
              rows={[
                ["Docker image size", "907MB (down from 3.45GB)"],
                ["Deployment target", "AWS EC2 t3.micro, free tier"],
                ["First prediction, deployed (10 MC-Dropout passes)", "6.1s cold, 3.8s warm"],
                ["Memory usage under real load", "522.8MB / 700MB limit"],
              ]}
            />
            <p>
              The first real deployed prediction — 30 MC-Dropout passes on a 1GB, 0-swap
              instance — locked up the entire instance. Diagnosed via SSH after reboot
              (AWS's own hypervisor health checks stayed "ok," confirming in-guest
              resource exhaustion, not infrastructure failure). Fixed with a
              configurable pass count (deployed at 10, not 30), a 1GB swap file, and a
              hard Docker memory limit — re-tested clean, no further lockups.
            </p>
          </ExpandSection>
          </div>
        </div>
      </main>
    </div>
  );
}
