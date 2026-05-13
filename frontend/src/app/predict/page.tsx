"use client";
export const dynamic = "force-dynamic";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, CheckCircle, AlertCircle, FileText, Activity, Brain, History, Trash2, Layers, ImageIcon, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PredictionResult {
  prediction: string;
  confidence: number;
  probabilities: Record<string, number>;
  heatmap: string | null;
  report: {
    summary: string;
    status: string;
    risk_level: string;
  };
}

interface HistoryItem {
  id: string;
  timestamp: number;
  filename: string;
  thumbnail: string | null;
  result: PredictionResult;
}

interface BatchFile {
  id: string;
  file: File;
  preview: string;
  status: "pending" | "processing" | "done" | "error";
  result?: PredictionResult;
}

export default function PredictPage() {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    const stored = localStorage.getItem("neuralpath_history");
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (e) {}
    }
  }, []);

  const saveToHistory = (filename: string, previewData: string | null, resultData: PredictionResult) => {
    const newItem: HistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      filename,
      thumbnail: resultData.heatmap ? `data:image/png;base64,${resultData.heatmap}` : previewData,
      result: resultData
    };
    
    setHistory(prev => {
      const updated = [newItem, ...prev].slice(0, 20);
      localStorage.setItem("neuralpath_history", JSON.stringify(updated));
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("neuralpath_history");
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (droppedFiles.length === 0) {
      toast.error("Please drop valid image files.");
      return;
    }
    
    if (mode === "single") {
      setFile(droppedFiles[0]);
      setPreview(URL.createObjectURL(droppedFiles[0]));
      setResult(null);
    } else {
      const newBatchFiles = droppedFiles.map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        file: f,
        preview: URL.createObjectURL(f),
        status: "pending" as const
      }));
      setBatchFiles(prev => [...prev, ...newBatchFiles]);
    }
  }, [mode]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files).filter(f => f.type.startsWith("image/"));
      if (filesArray.length === 0) {
        toast.error("Please select valid image files.");
        return;
      }
      
      if (mode === "single") {
        setFile(filesArray[0]);
        setPreview(URL.createObjectURL(filesArray[0]));
        setResult(null);
      } else {
        const newBatchFiles = filesArray.map(f => ({
          id: Math.random().toString(36).substr(2, 9),
          file: f,
          preview: URL.createObjectURL(f),
          status: "pending" as const
        }));
        setBatchFiles(prev => [...prev, ...newBatchFiles]);
      }
    }
  };

  const handleUploadSingle = async () => {
    if (!file || !preview) return;
    setIsLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/predict`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("API Error");

      const data = await response.json();
      setResult(data);
      saveToHistory(file.name, preview, data);
      toast.success("Analysis complete!");
    } catch (error) {
      console.error(error);
      toast.error("Connection Error: Is the inference server online?");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunBatch = async () => {
    setIsLoading(true);
    for (let i = 0; i < batchFiles.length; i++) {
      if (batchFiles[i].status === "done") continue;
      
      setBatchFiles(prev => prev.map((bf, idx) => idx === i ? { ...bf, status: "processing" } : bf));
      
      const formData = new FormData();
      formData.append("file", batchFiles[i].file);
      
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const response = await fetch(`${apiUrl}/api/predict`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("API Error");
        const data = await response.json();
        
        setBatchFiles(prev => prev.map((bf, idx) => idx === i ? { ...bf, status: "done", result: data } : bf));
        saveToHistory(batchFiles[i].file.name, batchFiles[i].preview, data);
      } catch (error) {
        setBatchFiles(prev => prev.map((bf, idx) => idx === i ? { ...bf, status: "error" } : bf));
      }
    }
    setIsLoading(false);
    toast.success("Batch processing complete!");
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  
  const removeBatchFile = (id: string) => {
    setBatchFiles(prev => prev.filter(f => f.id !== id));
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setMode("single");
    setFile(null); 
    setPreview(item.thumbnail); 
    setResult(item.result);
    setShowHistory(false);
  };

  const completedCount = batchFiles.filter(f => f.status === "done").length;
  const totalConfidence = batchFiles.filter(f => f.status === "done" && f.result).reduce((acc, f) => acc + (f.result?.confidence || 0), 0);
  const avgConfidence = completedCount > 0 ? (totalConfidence / completedCount).toFixed(1) : 0;
  const pathologiesCount = batchFiles.filter(f => f.status === "done" && f.result?.prediction !== "No Tumor").length;

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Navbar />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-teal-900/10 via-background to-background" />

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setShowHistory(false)}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-[350px] bg-slate-950 border-l border-white/10 shadow-2xl z-50 flex flex-col pt-16"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2"><History className="w-5 h-5 text-primary"/> Result History</h3>
                <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {history.length === 0 ? (
                  <p className="text-center text-slate-500 mt-10">No history yet.</p>
                ) : (
                  history.map((item) => (
                    <div key={item.id} onClick={() => loadHistoryItem(item)} className="bg-white/5 border border-white/10 rounded-xl p-3 cursor-pointer hover:bg-white/10 transition-colors flex gap-3 items-center group">
                      {item.thumbnail && <img src={item.thumbnail} className="w-12 h-12 rounded object-cover border border-white/10" alt="thumbnail" />}
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-medium truncate text-white">{item.filename}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${item.result.prediction === "No Tumor" ? "bg-teal-500/20 text-teal-400" : "bg-rose-500/20 text-rose-400"}`}>
                            {item.result.prediction}
                          </span>
                          <span className="text-xs text-slate-400">{item.result.confidence.toFixed(0)}%</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">{new Date(item.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {history.length > 0 && (
                <div className="p-4 border-t border-white/10">
                  <Button variant="destructive" onClick={clearHistory} className="w-full bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border-none">
                    <Trash2 className="w-4 h-4 mr-2" /> Clear History
                  </Button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="container mx-auto px-4 pt-32 pb-20 max-w-6xl">
        <div className="flex flex-col gap-8">
          <header className="flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
            <div>
              <h1 className="text-4xl font-bold mb-2">MRI Pathology Analysis</h1>
              <p className="text-muted-foreground">Upload brain MRI scans for rapid automated pathology classification with Grad-CAM heatmaps.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-slate-900/50 p-1 rounded-lg border border-white/10 flex">
                <button onClick={() => setMode("single")} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === "single" ? "bg-primary text-white shadow-md" : "text-slate-400 hover:text-white"}`}>Single</button>
                <button onClick={() => setMode("batch")} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === "batch" ? "bg-primary text-white shadow-md" : "text-slate-400 hover:text-white"}`}>Batch</button>
              </div>
              <button onClick={() => setShowHistory(true)} className="relative p-2.5 bg-slate-900/50 hover:bg-slate-800 border border-white/10 rounded-lg transition-colors flex items-center justify-center">
                <History className="w-5 h-5 text-slate-300" />
                {history.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-background">
                    {history.length}
                  </span>
                )}
              </button>
            </div>
          </header>

          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileChange}
            accept="image/*"
            multiple={mode === "batch"}
          />

          {mode === "single" ? (
            <div className="grid lg:grid-cols-2 gap-8 items-start">
              <div className="space-y-6">
                <Card className={`bg-slate-900/40 border-white/10 backdrop-blur-sm overflow-hidden transition-colors ${isDragging ? 'border-primary bg-primary/5' : ''}`}
                      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="w-5 h-5 text-primary" />
                      Scan Upload
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {!preview ? (
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all group ${isDragging ? 'border-primary scale-[0.98]' : 'border-white/10 hover:bg-white/5'}`}
                      >
                        <div className={`p-4 rounded-full transition-transform ${isDragging ? 'bg-primary text-white' : 'bg-primary/10 text-primary group-hover:scale-110'}`}>
                          <Upload className="w-8 h-8" />
                        </div>
                        <div className="text-center">
                          <p className="font-medium">{isDragging ? "Drop scan here" : "Upload or drag MRI Scan"}</p>
                          <p className="text-xs text-muted-foreground mt-1">PNG, JPG or DICOM supported</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="relative rounded-xl overflow-hidden border border-white/10">
                          <img src={preview} alt="Original Scan" className="w-full h-auto aspect-square object-cover" />
                          <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] uppercase font-bold text-white">Original</div>
                          <button onClick={clearFile} className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full hover:bg-black/80 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        
                        {result?.heatmap && (
                          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative rounded-xl overflow-hidden border border-primary/30 shadow-lg shadow-primary/10">
                            <img src={`data:image/png;base64,${result.heatmap}`} alt="Heatmap Analysis" className="w-full h-auto aspect-square object-cover" />
                            <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-primary/60 backdrop-blur-sm rounded text-[10px] uppercase font-bold text-white">Heatmap (Grad-CAM)</div>
                          </motion.div>
                        )}
                      </div>
                    )}

                    <Button onClick={handleUploadSingle} disabled={!preview || isLoading || !!result} className="w-full h-12 text-md font-bold">
                      {isLoading ? (
                        <><Activity className="mr-2 h-5 w-5 animate-spin" /> Analyzing Neuro-Pathways...</>
                      ) : (
                        "Run Neural Diagnostics"
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {result && (
                  <Card className="bg-slate-900/40 border-white/10 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-primary">
                        <FileText className="w-5 h-5" /> Detailed Report
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={result.report.risk_level === "High" ? "destructive" : "secondary"} className="px-3">
                          Risk Level: {result.report.risk_level}
                        </Badge>
                        <Badge variant="outline" className="border-teal-500/30 text-teal-400">
                          Status: {result.report.status}
                        </Badge>
                      </div>
                      <p className="text-slate-300 leading-relaxed italic">
                        "{result.report.summary}"
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              <AnimatePresence mode="wait">
                {result ? (
                  <motion.div key="results" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                    <Card className="bg-slate-900/40 border-white/10 backdrop-blur-sm">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-teal-400">
                          <CheckCircle className="w-5 h-5" /> Diagnostic Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-8">
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Classification</p>
                              <h2 className="text-3xl font-bold text-white">{result.prediction}</h2>
                            </div>
                            <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30 px-3 py-1 text-md">
                              {result.confidence.toFixed(1)}% Confidence
                            </Badge>
                          </div>
                          <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${result.confidence}%` }} transition={{ duration: 1 }} className="h-full bg-teal-400" />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <Brain className="w-4 h-4 text-primary" /> Probability Distribution
                          </h4>
                          <div className="space-y-3">
                            {Object.entries(result.probabilities).map(([name, prob]) => (
                              <div key={name} className="space-y-1.5">
                                <div className="flex justify-between text-xs px-1">
                                  <span className={name === result.prediction ? "text-primary font-bold" : "text-slate-400"}>
                                    {name}
                                  </span>
                                  <span className="text-slate-500">{prob.toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${prob}%` }} transition={{ duration: 1, ease: "easeOut", delay: 0.2 }} className={`h-full ${name === result.prediction ? "bg-primary" : "bg-slate-500"}`} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ) : (
                  <div key="placeholder" className="h-full flex flex-col items-center justify-center p-12 text-center bg-white/5 rounded-3xl border border-white/5">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                      <Activity className="w-10 h-10 text-slate-700" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">No Results Yet</h3>
                    <p className="text-muted-foreground max-w-[280px]">Upload a brain MRI scan and run the diagnostic engine to see detailed classification results here.</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                <Card className="bg-slate-900/40 border-white/10 backdrop-blur-sm col-span-2">
                  <CardContent className="p-6">
                    <div 
                      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${isDragging ? 'border-primary bg-primary/5' : 'border-white/10 hover:bg-white/5'}`}
                    >
                      <Layers className={`w-10 h-10 mx-auto mb-4 ${isDragging ? 'text-primary' : 'text-slate-500'}`} />
                      <h3 className="text-lg font-medium mb-2">Drag & Drop multiple scans</h3>
                      <p className="text-sm text-muted-foreground mb-6">Process up to 20 images in one batch</p>
                      <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="border-white/20">Add Files</Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/40 border-white/10 backdrop-blur-sm">
                  <CardContent className="p-6 flex flex-col justify-center h-full space-y-4">
                    <div className="flex justify-between">
                      <div>
                        <p className="text-sm text-slate-400">Total Files</p>
                        <p className="text-3xl font-bold">{batchFiles.length}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-400">Completed</p>
                        <p className="text-3xl font-bold text-teal-400">{completedCount}</p>
                      </div>
                    </div>
                    <Button onClick={handleRunBatch} disabled={batchFiles.length === 0 || isLoading || completedCount === batchFiles.length} className="w-full h-12 mt-4 font-bold">
                      {isLoading ? <><Activity className="w-4 h-4 mr-2 animate-spin"/> Processing...</> : <><Play className="w-4 h-4 mr-2"/> Run All Files</>}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {batchFiles.length > 0 && (
                <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
                  <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                    <h3 className="font-semibold flex items-center gap-2"><ImageIcon className="w-4 h-4 text-primary" /> Batch Queue</h3>
                    <div className="flex gap-4 text-sm text-slate-400">
                      <span>Found Pathologies: <span className="text-white font-bold">{pathologiesCount}</span></span>
                      <span>Avg Confidence: <span className="text-white font-bold">{avgConfidence}%</span></span>
                    </div>
                  </div>
                  <div className="divide-y divide-white/5">
                    {batchFiles.map((bf) => (
                      <motion.div key={bf.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors">
                        <img src={bf.result?.heatmap ? `data:image/png;base64,${bf.result.heatmap}` : bf.preview} alt="preview" className="w-16 h-16 rounded-md object-cover border border-white/10 bg-black/50" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">{bf.file.name}</p>
                          {bf.result && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${bf.result.prediction === "No Tumor" ? "bg-teal-500/20 text-teal-400" : "bg-rose-500/20 text-rose-400"}`}>
                                {bf.result.prediction}
                              </span>
                              <span className="text-xs text-slate-400">{bf.result.confidence.toFixed(1)}%</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          {bf.status === "pending" && <Badge variant="outline" className="text-slate-400">Pending</Badge>}
                          {bf.status === "processing" && <Badge className="bg-blue-500/20 text-blue-400"><Activity className="w-3 h-3 mr-1 animate-spin"/> Processing</Badge>}
                          {bf.status === "done" && <Badge className="bg-teal-500/20 text-teal-400"><CheckCircle className="w-3 h-3 mr-1"/> Done</Badge>}
                          {bf.status === "error" && <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1"/> Error</Badge>}
                          
                          <button onClick={() => removeBatchFile(bf.id)} className="text-slate-500 hover:text-white p-1" disabled={bf.status === "processing"}>
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
