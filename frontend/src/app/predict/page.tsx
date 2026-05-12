"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, CheckCircle, AlertCircle, FileText, Activity, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PredictionResult {
  prediction: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export default function PredictPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith("image/")) {
        toast.error("Please upload an image file (MRI scan).");
        return;
      }
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      // Point to your FastAPI backend (adjust URL for production)
      const response = await fetch("http://localhost:8000/api/predict", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to process image. Make sure the backend is running.");
      }

      const data = await response.json();
      setResult(data);
      toast.success("Analysis complete!");
    } catch (error) {
      console.error(error);
      toast.error("Connection Error: Is the inference server online?");
      
      // Fallback for demo purposes if backend isn't running
      /*
      setResult({
        prediction: "Glioma Tumor",
        confidence: 94.2,
        probabilities: {
          "Glioma Tumor": 94.2,
          "Meningioma Tumor": 3.1,
          "No Tumor": 1.5,
          "Pituitary Tumor": 1.2
        }
      });
      */
    } finally {
      setIsLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="relative min-h-screen">
      <Navbar />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-teal-900/10 via-background to-background" />

      <main className="container mx-auto px-4 pt-32 pb-20 max-w-5xl">
        <div className="flex flex-col gap-8">
          <header className="text-center">
            <h1 className="text-4xl font-bold mb-4">MRI Pathology Analysis</h1>
            <p className="text-muted-foreground">Upload a brain MRI scan for rapid automated pathology classification.</p>
          </header>

          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {/* Upload Section */}
            <Card className="bg-slate-900/40 border-white/10 backdrop-blur-sm overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-primary" />
                  Scan Upload
                </CardTitle>
                <CardDescription>Drop your scan here or click to browse.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!preview ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/10 rounded-2xl p-12 flex flex-col items-center justify-center gap-4 hover:bg-white/5 cursor-pointer transition-all group"
                  >
                    <div className="p-4 bg-primary/10 rounded-full group-hover:scale-110 transition-transform">
                      <Upload className="w-8 h-8 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium">Upload MRI Scan</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG or DICOM supported</p>
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      onChange={handleFileChange}
                      accept="image/*"
                    />
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-white/10">
                    <img src={preview} alt="MRI Preview" className="w-full h-auto aspect-square object-cover" />
                    <button 
                      onClick={clearFile}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full hover:bg-black/80 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-4 left-4">
                      <Badge className="bg-black/60 backdrop-blur-md">Ready for Analysis</Badge>
                    </div>
                  </div>
                )}

                <Button 
                  onClick={handleUpload}
                  disabled={!file || isLoading} 
                  className="w-full h-12 text-md font-bold"
                >
                  {isLoading ? (
                    <>
                      <Activity className="mr-2 h-5 w-5 animate-spin" />
                      Analyzing Neuro-Pathways...
                    </>
                  ) : (
                    "Run Neural Diagnostics"
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Results Section */}
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <Card className="bg-slate-900/40 border-white/10 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-teal-400" />
                        Diagnostic Result
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
                        <Progress value={result.confidence} className="h-3 bg-white/5" />
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <Brain className="w-4 h-4 text-primary" />
                          Probability Distribution
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
                              <Progress 
                                value={prob} 
                                className={`h-1.5 bg-white/5 ${name === result.prediction ? "[&>div]:bg-primary" : "[&>div]:bg-slate-700"}`} 
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-6 border-t border-white/5">
                        <Button variant="outline" className="w-full flex items-center gap-2 border-white/10">
                          <FileText className="w-4 h-4" /> Generate Full Report
                        </Button>
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
        </div>
      </main>
    </div>
  );
}
