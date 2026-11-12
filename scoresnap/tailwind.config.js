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
        bg: "#FAF4E8",
        card: "#FFFFFF",
        "card-hover": "#FAF4E8",
        accent: "#175C3A",
        "accent-dim": "#175C3A",
        warn: "#9A4A12",
        danger: "#A3261B",
        gold: "#8A6A00",
        silver: "#62665F",
        bronze: "#88552A",
        "text-primary": "#17251E",
        "text-dim": "#5E6257",
        border: "#E3D9C6",
        "input-bg": "#FFFFFF",
        purple: "#70408D",
        blue: "#245C98",
      },
    },
  },
  plugins: [],
};
