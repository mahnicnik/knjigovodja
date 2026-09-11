import type { Metadata } from "next";
import PageHelp from "@/components/PageHelp";
import ZascitaStevilcnihPolj from "@/components/ZascitaStevilcnihPolj";
import ZaznavaNoveRazlicice from "@/components/ZaznavaNoveRazlicice";
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
  /**
   * METAPODATKI (prelet 250)
   * ════════════════════════
   *
   * PREJ: \"Zamenja racunovodja za 9.99/mesec\". Dvoje je bilo narobe.
   *
   * 1. CENA je bila stara - paket Pro stane 12,99 EUR, Pro + POS pa 29,99.
   *    Napacna cena v iskalniku je slabsa od nobene: obiskovalec pride z
   *    napacnim pricakovanjem in odide razocaran.
   *
   * 2. \"ZAMENJA RACUNOVODJA\" je napacna obljuba in slaba strategija.
   *    Racunko nima glavne knjige, osnovnih sredstev ne obracuna plac na
   *    ravni servisa - racunovodkinje torej ne zamenja. Predvsem pa si s tem
   *    stavkom naredi sovraznika iz racunovodskih servisov, ki bi lahko bili
   *    najboljsi prodajni kanal: izvoz VOD jim prinese ciste podatke za
   *    uvoz v Vasco ali Pantheon.
   *
   * ZDAJ: blagajna in racunovodstvo v enem, z izvozom za racunovodjo.
   * To je hkrati resnicno IN edinstveno - nihce drug v Sloveniji nima
   * prave gostinske blagajne skupaj s knjigo prihodkov.
   */
  metadataBase: new URL('https://xn--raunko-j2a.si'),
  title: {
    default: "Računko — blagajna in računovodstvo za slovenski s.p.",
    template: "%s · Računko",
  },
  description: "Davčna blagajna za lokale in fakturiranje za s.p. v enem programu. FURS potrjevanje, delo brez povezave, izvoz za računovodjo (Vasco, Pantheon). Od 12,99 €/mesec.",
  keywords: [
    "davčna blagajna", "blagajna za lokal", "POS blagajna gostinstvo",
    "program za izdajanje računov", "s.p. računi", "FURS davčno potrjevanje",
    "e-račun eSLOG", "KPO knjiga", "računovodski program s.p.",
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'sl_SI',
    siteName: 'Računko',
    title: 'Računko — blagajna in računovodstvo za slovenski s.p.',
    description: 'Davčna blagajna za lokale in fakturiranje za s.p. v enem programu. FURS potrjevanje, delo brez povezave, izvoz za računovodjo.',
  },
  robots: { index: true, follow: true },
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
      <body className="min-h-full flex flex-col">{children}<PageHelp /><ZascitaStevilcnihPolj /><ZaznavaNoveRazlicice /></body>
    </html>
  );
}