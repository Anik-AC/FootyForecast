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
        ff: {
          bg: "#0B0A12",
          surface: "#15131F",
          surface2: "#120F1E",
          track: "#1D1A2A",
          text: "#F2F1F7",
          muted: "#9E99B0",
          dim: "#7E7892",
          dim2: "#645F77",
          hairline: "rgba(255,255,255,0.07)",
          green: "#2BE38A",
          gold: "#FFC23D",
          blue: "#5B8CFF",
          teal: "#1FD0C0",
          purple: "#A35CFF",
          red: "#FF5D6A",
        },
      },
      fontFamily: {
        sans: ["Archivo", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      maxWidth: {
        ff: "1180px",
      },
      borderRadius: {
        card: "16px",
        hero: "24px",
      },
      keyframes: {
        "ff-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "ff-grow": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        "ff-pulse": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "ff-up": "ff-up 0.4s ease both",
        "ff-grow": "ff-grow 0.7s ease both",
        "ff-pulse": "ff-pulse 2s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
