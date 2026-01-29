import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Imaginevoxa - AI-Powered LinkedIn Content Generator",
  description: "Create high-performing LinkedIn posts in seconds with AI. Generate engaging content, publish directly, and grow your professional presence.",
  keywords: ["LinkedIn", "AI content generator", "social media", "post generator", "content creation", "personal branding"],
  authors: [{ name: "Imaginevoxa" }],
  creator: "Imaginevoxa",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://imaginevoxa.com",
    siteName: "Imaginevoxa",
    title: "Imaginevoxa - AI-Powered LinkedIn Content Generator",
    description: "Create high-performing LinkedIn posts in seconds with AI.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Imaginevoxa - AI LinkedIn Content Generator"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Imaginevoxa - AI-Powered LinkedIn Content",
    description: "Create high-performing LinkedIn posts in seconds with AI.",
    images: ["/og-image.png"]
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <body
        className={`${spaceGrotesk.variable} ${fraunces.variable} ${jetbrains.variable} antialiased`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
