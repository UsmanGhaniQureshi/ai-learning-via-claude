/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Syne'", "sans-serif"],
        body:    ["'DM Sans'", "sans-serif"],
      },
      colors: {
        page:    "#0a0a0f",
        card:    "rgba(255,255,255,0.04)",
        elevated:"rgba(255,255,255,0.08)",
        accent: {
          DEFAULT: "#7c3aed",
          bright:  "#8b5cf6",
          soft:    "rgba(124,58,237,0.15)",
          glow:    "rgba(124,58,237,0.3)",
        },
        cyan: {
          DEFAULT: "#06b6d4",
          glow:    "rgba(6,182,212,0.3)",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.08)",
          accent:  "rgba(124,58,237,0.5)",
          focus:   "rgba(124,58,237,0.8)",
        },
        text: {
          primary:   "#f1f0ff",
          secondary: "#94a3b8",
          muted:     "#475569",
          accent:    "#a78bfa",
        },
        success: "#10b981",
        warning: "#f59e0b",
        danger:  "#ef4444",
      },
      boxShadow: {
        card:   "0 4px 24px rgba(0,0,0,0.4)",
        accent: "0 0 40px rgba(124,58,237,0.15)",
        glow:   "0 0 24px rgba(124,58,237,0.4)",
        cyan:   "0 0 24px rgba(6,182,212,0.3)",
      },
      borderRadius: {
        sm: "6px",
        md: "12px",
        lg: "20px",
        xl: "28px",
      },
      backdropBlur: {
        xs: "4px",
        card: "12px",
        nav: "20px",
      },
      animation: {
        "fade-up":    "fadeUp 0.3s ease forwards",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "fill-bar":   "fillBar 0.8s cubic-bezier(0.16,1,0.3,1) forwards",
      },
      keyframes: {
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        glowPulse: {
          "0%,100%": { boxShadow: "0 0 20px rgba(124,58,237,0.3)" },
          "50%":     { boxShadow: "0 0 40px rgba(124,58,237,0.6)" },
        },
        fillBar: {
          "0%":   { width: "0%" },
          "100%": { width: "var(--bar-width)" },
        },
      },
    },
  },
  plugins: [],
}
