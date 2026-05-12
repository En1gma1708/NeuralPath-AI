"use client";

import Link from "next/link";
import { Activity, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-white/10 bg-background/60 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            NeuralPath <span className="text-primary">AI</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="#features" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">
            Features
          </Link>
          <Link href="#about" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">
            About
          </Link>
          <Link href="/predict">
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-white px-6">
              Launch App
            </Button>
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button className="md:hidden text-white" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X /> : <Menu />}
        </button>
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
              <Link href="#features" className="text-sm font-medium py-2" onClick={() => setIsOpen(false)}>
                Features
              </Link>
              <Link href="#about" className="text-sm font-medium py-2" onClick={() => setIsOpen(false)}>
                About
              </Link>
              <Link href="/predict" onClick={() => setIsOpen(false)}>
                <Button className="w-full">Launch App</Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
