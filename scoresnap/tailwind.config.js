/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "#0a1628",
        card: "#111d33",
        "card-hover": "#162545",
        accent: "#00d47e",
        "accent-dim": "#00b86b",
        warn: "#ff6b35",
        danger: "#ff4757",
        gold: "#ffd700",
        silver: "#c0c0c0",
        bronze: "#cd7f32",
        "text-primary": "#e8edf5",
        "text-dim": "#7a8ba8",
        border: "#1e3050",
        "input-bg": "#0d1f38",
        purple: "#a855f7",
        blue: "#3b82f6",
      },
    },
  },
  plugins: [],
};
