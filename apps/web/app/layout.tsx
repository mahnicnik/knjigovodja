import type { Metadata } from "next";
import PageHelp from "@/components/PageHelp";
import { Geist, Geist_Mono, Newsreader, Bricolage_Grotesque, Plus_Jakarta_Sans, Fraunces, Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";

const rkSans = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400","500","600","700","800","900"], variable: "--rk-font-sans" })
const rkSerif = Newsreader({ subsets: ["latin"], weight: ["400","500"], style: ["italic"], variable: "--rk-font-serif" })
const rkMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--rk-font-mono" })
import "./globals.css";
import "../public/racunko-ds.css";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  title: "Računko — AI računovodja za slovenskega s.p.",
  description: "Zamenja računovodja za €9.99/mesec. AI ki pozna FURS, vaše dejanske podatke in slovensko davčno pravo. Brez vezave, brez kreditne kartice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sl"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${bricolage.variable} ${jakarta.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        <style>{`
          :root {
            --ff-display: var(--font-newsreader), 'Newsreader', serif;
            --ff-body: var(--font-geist-sans), system-ui, sans-serif;
            --ff-mono: var(--font-geist-mono), ui-monospace, monospace;
          }
        `}</style>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0E3D2A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Računko" />
        {/* POPRAVLJENO (19.8.2026): `maximum-scale=1` je uporabniku PREPOVEDAL
            priblizevanje zaslona. Na racunih in v tabelah z drobno pisavo je bilo
            to mocno mote(ce, za slabovidne pa oviro. Samodejno priblizevanje ob
            kliku v polje resujemo z `font-size: 16px` v globals.css. */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-full flex flex-col">{children}<PageHelp /></body>
    </html>
  );
}