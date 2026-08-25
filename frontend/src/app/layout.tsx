import type { Metadata } from "next";
import { Outfit, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LenisProvider } from "@/components/LenisProvider";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

// Technical/monospace-leaning display face for headings - matches the
// existing font-mono label styling ([ + ] brackets, uppercase eyebrows)
// already used across the site, so headings and labels now share one
// visual language instead of the previous mismatch (sans headings, mono
// labels, no deliberate pairing).
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "NeuralPath AI | Brain Pathology Detection",
  description: "Advanced deep learning platform for brain MRI pathology analysis and tumor classification.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={{ baseTheme: undefined }}>
      <html lang="en" suppressHydrationWarning className="antialiased">
        <body className={`${outfit.variable} ${spaceGrotesk.variable} font-sans flex flex-col bg-background text-foreground`}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <LenisProvider>
              {children}
              <Toaster position="top-center" />
            </LenisProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
