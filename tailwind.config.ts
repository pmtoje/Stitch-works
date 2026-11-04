import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: { DEFAULT: "1rem", md: "2rem" }, screens: { "2xl": "1320px" } },
    extend: {
      colors: {
        forest: { 50: "#eef4f0", 100: "#d5e5da", 200: "#a9c9b3", 300: "#76a688", 400: "#4a8262", 500: "#2d6547", 600: "#1f4f37", 700: "#173d2b", 800: "#112e21", 900: "#0b2018", 950: "#06140e" },
        cream: { 50: "#fdfbf6", 100: "#f8f3e8", 200: "#f0e7d4", 300: "#e4d6b8" },
        charcoal: { 600: "#4a4844", 700: "#34322f", 800: "#232220", 900: "#171614" },
        ochre: { 300: "#e2c27e", 400: "#d4a853", 500: "#bf8f35", 600: "#9c722a", 700: "#7a5821" },
        stone: { 400: "#a29d94", 500: "#7f7a71", 600: "#5f5b54" },
      },
      fontFamily: {
        display: ['"Fraunces Variable"', "Georgia", "serif"],
        sans: ['"Inter Tight Variable"', "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      letterSpacing: { eyebrow: "0.18em" },
      maxWidth: { prose: "68ch" },
    },
  },
  plugins: [],
} satisfies Config;
