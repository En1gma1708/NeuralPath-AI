"use client";

import { useEffect, useState, Suspense } from "react";
import BrainCanvas from "@/components/BrainCanvas";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ArrowRight, Brain, Shield, CheckCircle2, ChevronRight, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";

export default function LandingPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <div className="relative min-h-screen">
      <Navbar />
      
      {/* Background Gradient */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-background to-background" />

      <main className="container mx-auto px-4 pt-32 pb-20">
        {/* Hero Section */}
        <section className="grid lg:grid-cols-2 gap-12 items-center mb-32">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-6"
          >
            <motion.div variants={itemVariants}>
              <Badge variant="outline" className="px-4 py-1 border-primary/50 text-primary bg-primary/5 rounded-full">
                Neural Pathology Analysis
              </Badge>
            </motion.div>
            
            <motion.h1 
              variants={itemVariants}
              className="text-5xl lg:text-7xl font-bold leading-tight tracking-tighter"
            >
              Precision Diagnostics <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300">
                Driven by Intelligence
              </span>
            </motion.h1>

            <motion.p 
              variants={itemVariants}
              className="text-lg text-muted-foreground max-w-[500px]"
            >
              Harness the power of advanced deep learning for rapid, reliable brain pathology detection and MRI analysis. Built for accuracy, designed for healthcare.
            </motion.p>

            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 pt-4">
              <SignedIn>
                <Link href="/predict">
                  <Button size="lg" className="h-12 px-8 text-md font-semibold bg-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/25">
                    Start Scanning <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
              </SignedIn>
              <SignedOut>
                <SignInButton mode="modal">
                  <Button size="lg" className="h-12 px-8 text-md font-semibold bg-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/25">
                    Get Started <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </SignInButton>
              </SignedOut>
              
              <Link href="https://github.com/En1gma1708/NeuralPath-AI" target="_blank">
                <Button size="lg" variant="outline" className="h-12 px-8 text-md border-white/10 hover:bg-white/5">
                  View Documentation
                </Button>
              </Link>
            </motion.div>

            <motion.div variants={itemVariants} className="flex items-center gap-6 mt-4">
              <div className="text-sm">
                <p className="font-medium text-white italic">Brain Tumor Classification System</p>
                <div className="flex items-center text-teal-400 gap-1">
                  Automated Pathology Screening Research
                </div>
              </div>
            </motion.div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative h-[600px]"
          >
            <div className="w-full h-full rounded-3xl overflow-hidden border border-white/10 shadow-2xl shadow-primary/10 bg-slate-900/20 backdrop-blur-sm">
              <BrainCanvas />
            </div>
            
            {/* Stats Card Overlay */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.5 }}
              className="absolute -bottom-6 -left-6 bg-slate-900/80 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-xl max-w-[200px] z-10"
            >
              <Zap className="w-8 h-8 text-yellow-400 mb-2" />
              <p className="text-sm text-slate-400">Processing Speed</p>
              <p className="text-2xl font-bold text-white">&lt; 1.2s</p>
            </motion.div>
          </motion.div>
        </section>

        {/* Features Section */}
        <section id="features" className="mb-32">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Empowering Clinical Decision Making</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our neural network architecture is optimized specifically for neuro-imaging artifacts, ensuring high-fidelity detection across various MRI machines.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { 
                icon: <Brain className="w-8 h-8 text-blue-400" />, 
                title: "Deep Learning Engine", 
                desc: "Powered by custom VGG-16 backbone architecture optimized for high-resolution MRI feature extraction." 
              },
              { 
                icon: <Shield className="w-8 h-8 text-teal-400" />, 
                title: "Enterprise Security", 
                desc: "Compliant image processing pipelines with encrypted metadata handling and privacy-first design." 
              },
              { 
                icon: <Zap className="w-8 h-8 text-purple-400" />, 
                title: "Real-time Inference", 
                desc: "Low-latency prediction engine delivering results in milliseconds for rapid clinical screening." 
              },
            ].map((feature, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Card className="bg-slate-900/40 border-white/5 backdrop-blur-sm h-full">
                  <CardContent className="pt-8 flex flex-col gap-4">
                    <div className="p-3 bg-white/5 rounded-2xl w-fit">
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-bold">{feature.title}</h3>
                    <p className="text-slate-400 leading-relaxed">
                      {feature.desc}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Pathologies Section */}
        <section className="py-20 border-y border-white/5 bg-white/5 rounded-[3rem] px-8 lg:px-16 overflow-hidden relative">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-8 leading-tight">Supported Pathology <br />Classification</h2>
              <div className="grid gap-4">
                {["Glioma Tumor Detection", "Meningioma Analysis", "Pituitary Tumor Classification", "Healthy Control Validation"].map((path, i) => (
                  <div key={i} className="flex items-center gap-3 text-slate-300">
                    <CheckCircle2 className="w-6 h-6 text-teal-500" />
                    <span className="text-lg font-medium">{path}</span>
                  </div>
                ))}
              </div>
              <Button variant="link" className="mt-8 text-primary p-0 h-auto text-lg group">
                Learn more about our dataset <ChevronRight className="ml-1 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
            <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 group">
               <div className="absolute inset-0 bg-primary/20 mix-blend-overlay group-hover:bg-primary/0 transition-colors" />
               <Image 
                src="/hero.png" 
                alt="AI Classification Visual" 
                fill
                className="object-cover"
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-12">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <span className="text-lg font-bold">NeuralPath AI</span>
          </div>
          <p className="text-slate-500 text-sm italic">
            Automated Brain Pathology Detection & Classification
          </p>
          <div className="flex gap-6">
            <Link href="https://github.com/En1gma1708/NeuralPath-AI" className="text-slate-500 hover:text-white transition-colors">Source Code</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Activity(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
