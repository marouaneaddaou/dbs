import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff1f1",
          100: "#ffdede",
          200: "#ffc2c2",
          300: "#ff9a9a",
          400: "#ff6464",
          500: "#f52424",
          600: "#dd0000",
          700: "#b30000",
          800: "#8f0505",
          900: "#760b0b",
          950: "#410000",
        },
        gold: {
          50: "#fffbe6",
          100: "#fff6c2",
          200: "#ffed85",
          300: "#ffe247",
          400: "#ffd60a",
          500: "#ffcc00",
          600: "#e0a800",
          700: "#b37f02",
          800: "#8f6306",
          900: "#75510b",
          950: "#452d00",
        },
        ink: {
          900: "#111111",
          800: "#171717",
          700: "#1e1e1e",
          600: "#262626",
          500: "#333333",
          400: "#4a4a4a",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Soft, light-theme shadows only — no heavy dark glows.
        card: "0 1px 2px 0 rgba(16, 24, 40, 0.04), 0 1px 3px 0 rgba(16, 24, 40, 0.06)",
        "card-hover": "0 8px 20px -8px rgba(16, 24, 40, 0.16)",
        glow: "0 6px 18px -6px rgba(221, 0, 0, 0.35)",
        "glow-gold": "0 6px 18px -6px rgba(224, 168, 0, 0.4)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%": { transform: "scale(1.25)", opacity: "0" },
          "100%": { transform: "scale(1.25)", opacity: "0" },
        },
        "box-shake": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "20%": { transform: "rotate(-6deg)" },
          "40%": { transform: "rotate(6deg)" },
          "60%": { transform: "rotate(-4deg)" },
          "80%": { transform: "rotate(4deg)" },
        },
        "lid-open": {
          "0%": { transform: "translateY(0) rotate(0deg)" },
          "100%": { transform: "translateY(-140%) rotate(-24deg)" },
        },
        shine: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        progress: {
          "0%": { width: "0%" },
          "100%": { width: "100%" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out both",
        "scale-in": "scale-in 0.28s ease-out both",
        "slide-up": "slide-up 0.45s ease-out both",
        "pulse-ring": "pulse-ring 1.6s ease-out infinite",
        "box-shake": "box-shake 0.5s ease-in-out",
        "lid-open": "lid-open 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        shine: "shine 2.4s linear infinite",
        float: "float 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
