import type { Metadata } from "next";
import { Baloo_2, Nunito, Lora, Raleway } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

const baloo = Baloo_2({ subsets: ["latin"], variable: "--font-baloo", display: "swap" });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap" });
const raleway = Raleway({ subsets: ["latin"], variable: "--font-raleway", display: "swap" });

export const metadata: Metadata = {
  title: "Routine",
  description: "A calm, minimal daily routine and habit tracker.",
};

// Applied before first paint so a stored "amber" choice never flashes the
// default kitty theme. Mirrors lib/theme.ts resolveTheme(): only the exact
// string "amber" switches away from the kitty default. Wrapped so a storage
// exception (private mode) can never block render.
const themeScript = `(function(){try{if(localStorage.getItem('routine-theme')==='amber'){document.documentElement.dataset.theme='amber';}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${baloo.variable} ${nunito.variable} ${lora.variable} ${raleway.variable} antialiased`}
      >
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
