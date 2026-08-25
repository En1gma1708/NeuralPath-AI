"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="pt-32 pb-16 md:pb-20">
      <Link
        href="/about"
        className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-brand transition-colors mb-8"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Back to overview
      </Link>
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="block text-xs font-mono uppercase tracking-widest text-brand mb-4"
      >
        {eyebrow}
      </motion.span>
      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="text-4xl md:text-6xl font-bold tracking-tight text-foreground max-w-3xl text-balance"
      >
        {title}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed"
      >
        {description}
      </motion.p>
    </div>
  );
}
