"use client";
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import BrainCanvas from "@/components/BrainCanvas";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { motion } from "framer-motion";
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
            <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 bg-slate-950 group">
               <Image 
                src="/mri-base.png" 
                alt="Clinical MRI Scan" 
                fill
                className="object-cover opacity-80"
              />
              
              {/* Pulsing Grad-CAM Heatmap */}
              <motion.div 
                className="absolute inset-0 pointer-events-none mix-blend-screen"
                animate={{ opacity: [0.2, 0.9, 0.2] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="absolute top-[35%] left-[55%] w-40 h-40 rounded-full blur-[24px]" 
                     style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.9) 0%, rgba(249,115,22,0.5) 40%, transparent 70%)' }}>
                </div>
              </motion.div>

              {/* Sweeping Scan Line */}
              <motion.div 
                className="absolute left-0 right-0 h-[2px] bg-teal-400 shadow-[0_0_15px_4px_rgba(45,212,191,0.6)] pointer-events-none z-10"
                animate={{ top: ["0%", "100%", "0%"] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
              />

              {/* Clinical Confidence HUD */}
              <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 font-mono flex flex-col items-end z-20 shadow-lg">
                <span className="text-[10px] text-teal-400 tracking-widest">AI CONFIDENCE</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">99.8</span>
                  <span className="text-sm text-slate-400">%</span>
                </div>
              </div>
              <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-md border border-white/10 rounded-lg px-3 py-1.5 font-mono z-20">
                <span className="text-xs text-rose-400 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                  MENINGIOMA DETECTED
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Tech Stack Badges */}
        <section className="py-16 text-center">
          <p className="text-sm text-slate-500 uppercase tracking-widest mb-6">Built With</p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { label: "VGG-16", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
              { label: "TensorFlow", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
              { label: "Next.js 15", color: "bg-white/10 text-white border-white/20" },
              { label: "FastAPI", color: "bg-teal-500/10 text-teal-400 border-teal-500/20" },
              { label: "Groq / Llama 3.1", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
              { label: "Three.js", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
              { label: "Clerk Auth", color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
            ].map((tech) => (
              <span key={tech.label} className={`px-4 py-1.5 rounded-full text-xs font-semibold border ${tech.color}`}>
                {tech.label}
              </span>
            ))}
          </div>
        </section>

        {/* About / Credits Section */}
        <section id="about" className="py-20 border-y border-white/5">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">About This Project</h2>
            <p className="text-slate-400 leading-relaxed mb-6">
              NeuralPath AI is a deep learning research project for automated brain tumor detection 
              and classification from MRI scans. Built using a fine-tuned VGG-16 convolutional neural 
              network, it provides Grad-CAM visual explanations and AI-powered diagnostic insights.
            </p>
            <p className="text-slate-500 text-sm mb-8">
              Developed by{" "}
              <Link href="https://github.com/En1gma1708" target="_blank" className="text-teal-400 hover:text-teal-300 font-semibold transition-colors">
                Sahil Sharma
              </Link>{" "}
              — Computer Science undergraduate passionate about AI in healthcare.
            </p>
            <div className="flex justify-center gap-4">
              <Link href="/about">
                <Button variant="outline" className="border-white/10 hover:bg-white/5">
                  Learn More
                </Button>
              </Link>
              <Link href="https://github.com/En1gma1708" target="_blank">
                <Button variant="outline" className="border-white/10 hover:bg-white/5">
                  GitHub Profile
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Medical Disclaimer */}
        <section className="py-8">
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 text-center max-w-3xl mx-auto">
            <p className="text-amber-400/90 text-sm font-medium leading-relaxed">
              ⚕️ <strong>Medical Disclaimer:</strong> NeuralPath AI is a research and educational tool. 
              It is not a substitute for professional medical diagnosis, treatment, or advice. 
              Always consult a qualified healthcare provider for medical decisions.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-12 mt-8">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 items-start">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-5 h-5 text-primary" />
                <span className="text-lg font-bold">NeuralPath AI</span>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed">
                Automated brain pathology detection and classification powered by deep learning.
              </p>
            </div>

            {/* Links */}
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-slate-400 font-semibold mb-1">Links</p>
              <Link href="/predict" className="text-slate-500 hover:text-white transition-colors">Scan Analysis</Link>
              <Link href="/about" className="text-slate-500 hover:text-white transition-colors">About</Link>
              <Link href="https://github.com/En1gma1708/NeuralPath-AI" target="_blank" className="text-slate-500 hover:text-white transition-colors">Source Code</Link>
              <Link href="https://github.com/En1gma1708" target="_blank" className="text-slate-500 hover:text-white transition-colors">GitHub Profile</Link>
            </div>

            {/* Contact */}
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-slate-400 font-semibold mb-1">Contact</p>
              <Link href="https://github.com/En1gma1708" target="_blank" className="text-slate-500 hover:text-white transition-colors">
                Reach out on GitHub →
              </Link>
              <p className="text-slate-600 text-xs mt-2">
                For questions, collaborations, or feedback
              </p>
            </div>
          </div>

          <div className="border-t border-white/5 mt-8 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-slate-600 text-xs">
              © {new Date().getFullYear()} Sahil Sharma. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <span className="text-slate-700 text-xs px-3 py-1 rounded-full border border-white/5">MIT License</span>
              <span className="text-slate-700 text-xs">Built with ❤️ for healthcare AI research</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
