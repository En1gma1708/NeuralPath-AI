"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Cpu, Database, LineChart, Brain } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { StatGrid } from "@/components/explainability/StatGrid";
import { Spotlight } from "@/components/Spotlight";

const sections = [
  {
    href: "/about/architecture",
    icon: Cpu,
    title: "Architecture",
    desc: "EfficientNetB0 transfer learning, MC-Dropout uncertainty, Grad-CAM, and the tool-calling RAG chat assistant — how the pipeline actually works.",
  },
  {
    href: "/about/data",
    icon: Database,
    title: "Data & Methodology",
    desc: "Where the training and external validation data came from, the leakage-safe split, and what a 25.97-point generalization gap actually means.",
  },
  {
    href: "/about/results",
    icon: LineChart,
    title: "Results & Metrics",
    desc: "Every measured number from this project — held-out accuracy, external validation, uncertainty calibration — sourced, not rounded up.",
  },
];

export default function AboutPage() {
  return (
    <div className="relative min-h-screen">
      <Navbar />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-background to-background" />
      <Spotlight className="-z-10 h-[700px]" />

      <main className="container mx-auto px-4 pt-32 pb-24 max-w-5xl">
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="block text-xs font-mono uppercase tracking-widest text-brand mb-4"
        >
          About the project
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-4xl md:text-6xl font-bold tracking-tight text-foreground max-w-3xl text-balance"
        >
          A brain MRI classifier, built to be inspected — not just used.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed"
        >
          NeuralPath AI classifies brain MRI scans into four categories — glioma,
          meningioma, pituitary tumor, or no tumor — using a fine-tuned EfficientNetB0
          model. This isn't a demo dressed up to look finished: every number on these
          pages is a real, measured result, and every limitation is stated as directly
          as the wins.
        </motion.p>

        {/* Headline stats — real numbers, see docs/METRICS.md */}
        <div className="mt-16">
          <StatGrid
            stats={[
              { value: "94.88%", label: "Held-out test accuracy (fine-tuned model)" },
              { value: "72.83%", label: "External validation accuracy (independent data)" },
              { value: "7.17×", label: "Uncertainty entropy separation, correct vs. incorrect" },
              { value: "4", label: "Independently-sourced external validation datasets" },
            ]}
          />
        </div>

        {/* Section cards */}
        <div className="mt-24 grid md:grid-cols-3 gap-6">
          {sections.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.href}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
              >
                <Link href={s.href} className="group block h-full">
                  <div className="h-full flex flex-col gap-4 p-6 rounded-2xl border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-brand/40 transition-all">
                    <div className="p-3 bg-secondary/50 rounded-xl w-fit">
                      <Icon className="w-6 h-6 text-brand" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground">{s.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1">{s.desc}</p>
                    <span className="flex items-center gap-1 text-sm font-medium text-brand">
                      Explore <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Story / credits */}
        <div className="mt-24 pt-16 border-t border-border">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-secondary/50 rounded-xl border border-border">
              <Brain className="w-6 h-6 text-brand" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Why this exists</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed max-w-2xl">
            This project started as an EfficientNetB0 tumor classifier and grew into a
            full exploration of what it actually takes to make a medical imaging model
            trustworthy: uncertainty quantification, grounded explanations, honest
            external validation, and a real (if imperfect) production deployment. It's a
            personal project, built independently — not a clinical product, and every
            page here says so where it matters.
          </p>
          <div className="mt-8 flex flex-col gap-1">
            <span className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">
              Developed & Engineered By
            </span>
            <a
              href="https://github.com/En1gma1708"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xl font-bold text-brand hover:text-brand/80 hover:underline transition-all w-fit"
            >
              Sahil Sharma
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
