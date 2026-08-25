"use client";

import Link from "next/link";
import { Activity, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "@/components/ThemeToggle";

import { UserButton, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

const ABOUT_SUBLINKS = [
  { href: "/about/architecture", label: "Architecture", desc: "Model, uncertainty, Grad-CAM, RAG chat" },
  { href: "/about/data", label: "Data & Methodology", desc: "Sourcing, splits, generalization gap" },
  { href: "/about/results", label: "Results & Metrics", desc: "Every measured number, sourced" },
];

function AboutMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href="/about"
        className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-4"
      >
        About
      </Link>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-1/2 -translate-x-1/2 pt-2 w-64"
          >
            <div className="rounded-xl border border-border bg-background/95 backdrop-blur-md shadow-xl overflow-hidden">
              {ABOUT_SUBLINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block px-4 py-3 hover:bg-secondary/60 transition-colors border-b border-border last:border-b-0"
                >
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{item.desc}</span>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-white/10 bg-background/60 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">
            NeuralPath <span className="text-primary">AI</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="/#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Features
          </Link>
          <AboutMenu />

          <div className="flex items-center gap-4 border-l border-white/10 pl-4">
            <ThemeToggle />
            <SignedIn>
              <div className="flex items-center gap-4">
                <Link href="/predict">
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground px-6">
                    Dashboard
                  </Button>
                </Link>
                <UserButton afterSignOutUrl="/" />
              </div>
            </SignedIn>
            
            <SignedOut>
              <SignInButton mode="modal">
                <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground px-6">
                  Sign In
                </Button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>

        {/* Mobile Toggle */}
        <div className="md:hidden flex items-center gap-4">
          <ThemeToggle />
          <button className="text-foreground" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 w-full bg-background border-b border-white/10 p-4 md:hidden"
          >
            <div className="flex flex-col gap-4">
              <Link href="/#features" className="text-sm font-medium py-2 text-foreground" onClick={() => setIsOpen(false)}>
                Features
              </Link>
              <Link href="/about" className="text-sm font-medium py-2 text-foreground" onClick={() => setIsOpen(false)}>
                About
              </Link>
              <div className="flex flex-col gap-3 pl-4 border-l border-border ml-1">
                {ABOUT_SUBLINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              <SignedIn>
                <Link href="/predict" onClick={() => setIsOpen(false)}>
                  <Button className="w-full bg-primary text-primary-foreground">Dashboard</Button>
                </Link>
                <div className="flex justify-center pt-2">
                  <UserButton afterSignOutUrl="/" />
                </div>
              </SignedIn>
              
              <SignedOut>
                <SignInButton mode="modal">
                  <Button className="w-full bg-primary text-primary-foreground">Sign In</Button>
                </SignInButton>
              </SignedOut>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
