"use client";

import React from "react";
import { motion } from "framer-motion";

export default function BrainCanvas() {
  return (
    <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center relative bg-slate-950 rounded-2xl overflow-hidden border border-white/5">
      
      {/* Medical Background Grid */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      <div className="relative w-72 h-80 z-10">
        
        {/* Grayscale MRI Slice (SVG Approximation) */}
        <svg viewBox="0 0 200 250" className="w-full h-full drop-shadow-2xl opacity-90 filter grayscale">
          <defs>
            <radialGradient id="mri-gradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a3a3a3" />
              <stop offset="50%" stopColor="#525252" />
              <stop offset="85%" stopColor="#262626" />
              <stop offset="100%" stopColor="#0a0a0a" />
            </radialGradient>
            <filter id="noise">
              <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" stitchTiles="stitch" />
              <feColorMatrix type="matrix" values="1 0 0 0 0, 0 1 0 0 0, 0 0 1 0 0, 0 0 0 0.25 0" />
              <feBlend mode="overlay" in2="SourceGraphic" />
            </filter>
          </defs>
          
          {/* Skull Outline */}
          <ellipse cx="100" cy="125" rx="85" ry="110" fill="none" stroke="#e5e5e5" strokeWidth="4" opacity="0.8" />
          
          {/* Brain Matter Area */}
          <path 
            d="M 100,20 C 140,20 175,60 175,120 C 175,190 130,225 100,225 C 70,225 25,190 25,120 C 25,60 60,20 100,20 Z" 
            fill="url(#mri-gradient)" 
            filter="url(#noise)"
          />
          
          {/* Ventricles / Internal Structure */}
          <path d="M 85,90 C 90,80 95,90 95,110 C 95,130 90,140 85,130 Z" fill="#171717" opacity="0.9" />
          <path d="M 115,90 C 110,80 105,90 105,110 C 105,130 110,140 115,130 Z" fill="#171717" opacity="0.9" />
          
          {/* Cortical Folds (Simplified) */}
          <path d="M 50,70 Q 70,80 60,100" fill="none" stroke="#171717" strokeWidth="2.5" opacity="0.6" />
          <path d="M 150,70 Q 130,80 140,100" fill="none" stroke="#171717" strokeWidth="2.5" opacity="0.6" />
          <path d="M 40,130 Q 60,120 50,160" fill="none" stroke="#171717" strokeWidth="2.5" opacity="0.6" />
          <path d="M 160,130 Q 140,120 150,160" fill="none" stroke="#171717" strokeWidth="2.5" opacity="0.6" />
          <path d="M 70,180 Q 100,160 130,180" fill="none" stroke="#171717" strokeWidth="3" opacity="0.5" />
        </svg>

        {/* Heatmap Overlay (fading in and out) */}
        <motion.div 
          className="absolute inset-0 pointer-events-none mix-blend-screen"
          animate={{ opacity: [0.1, 0.85, 0.1] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Simulated Tumor Hotspot */}
          <div className="absolute top-[25%] left-[55%] w-20 h-24 rounded-full blur-[14px]" 
               style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.9) 0%, rgba(249,115,22,0.6) 40%, transparent 80%)' }}>
          </div>
          {/* Secondary Hotspot */}
          <div className="absolute top-[45%] left-[65%] w-12 h-12 rounded-full blur-[10px]" 
               style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.7) 0%, transparent 70%)' }}>
          </div>
        </motion.div>

        {/* Scanning Line Sweeping Across */}
        <motion.div 
          className="absolute left-[-5%] right-[-5%] h-[2px] bg-teal-400 shadow-[0_0_12px_3px_rgba(45,212,191,0.6)] z-20 pointer-events-none"
          animate={{ top: ["0%", "100%", "0%"] }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />

        {/* HUD Medical Data Overlay */}
        <div className="absolute top-2 left-2 text-[10px] font-mono text-teal-400/70 select-none">
          AXIAL T1+C<br/>
          TR: 450 TE: 14<br/>
          SL: 5.0 SP: 1.5
        </div>
        <div className="absolute bottom-2 right-2 text-[10px] font-mono text-teal-400/70 text-right select-none">
          W: 1024 L: 512<br/>
          FOV: 240x240<br/>
          <span className="text-rose-400 animate-pulse">ANOMALY DETECTED</span>
        </div>
        
      </div>
      
      {/* Target Crosshair */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03]">
        <div className="w-px h-full bg-white"></div>
        <div className="h-px w-full bg-white absolute"></div>
        <div className="w-64 h-64 border border-white rounded-full absolute"></div>
      </div>
      
    </div>
  );
}

