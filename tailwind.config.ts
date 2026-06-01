import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        foreground: "var(--foreground)",
        "muted-fg": "var(--muted-fg)",
        border: "var(--border)",
        primary: {
          DEFAULT: "var(--primary)",
          fg: "var(--primary-fg)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          fg: "var(--accent-fg)",
        },
        destructive: "var(--destructive)",
        ring: "var(--ring)",
      },
      fontFamily: {
        serif: ["var(--font-lora)", "ui-serif", "Georgia", "serif"],
        sans: ["var(--font-raleway)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
