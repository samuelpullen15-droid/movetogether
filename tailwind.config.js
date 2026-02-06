/** @type {import('tailwindcss').Config} */
const plugin = require("tailwindcss/plugin");

module.exports = {
  content: ["./App.tsx", "./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  corePlugins: {
    space: false,
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ['StackSansText_400Regular'],
        medium: ['StackSansText_500Medium'],
        semibold: ['StackSansText_600SemiBold'],
        bold: ['StackSansText_700Bold'],
        display: ['Outfit_700Bold'],
        'display-medium': ['Outfit_500Medium'],
        'display-semibold': ['Outfit_600SemiBold'],
        'display-extrabold': ['Outfit_800ExtraBold'],
      },
      colors: {
        // Apple Fitness inspired colors (same in both modes)
        ring: {
          move: "#FA114F",      // Red - Move ring
          exercise: "#92E82A",  // Green - Exercise ring
          stand: "#00D4FF",     // Cyan - Stand ring
        },
        medal: {
          gold: "#FFD700",
          silver: "#C0C0C0",
          bronze: "#CD7F32",
        },
        fitness: {
          accent: "#FA114F",
        },
        // Light mode colors
        light: {
          bg: "#FFFFFF",
          bgSecondary: "#F5F5F7",
          card: "#FFFFFF",
          cardSecondary: "#F5F5F7",
          text: "#000000",
          textSecondary: "#6B7280",
          border: "#E5E7EB",
        },
        // Dark mode colors
        dark: {
          bg: "#000000",
          bgSecondary: "#0D0D0D",
          card: "#1C1C1E",
          cardSecondary: "#2C2C2E",
          text: "#FFFFFF",
          textSecondary: "#9CA3AF",
          border: "#374151",
        },
      },
      fontSize: {
        xs: "10px",
        sm: "12px",
        base: "14px",
        lg: "18px",
        xl: "20px",
        "2xl": "24px",
        "3xl": "32px",
        "4xl": "40px",
        "5xl": "48px",
        "6xl": "56px",
        "7xl": "64px",
        "8xl": "72px",
        "9xl": "80px",
      },
    },
  },
  darkMode: "media",
  plugins: [
    plugin(({ matchUtilities, theme }) => {
      const spacing = theme("spacing");

      // space-{n}  ->  gap: {n}
      matchUtilities(
        { space: (value) => ({ gap: value }) },
        { values: spacing, type: ["length", "number", "percentage"] }
      );

      // space-x-{n}  ->  column-gap: {n}
      matchUtilities(
        { "space-x": (value) => ({ columnGap: value }) },
        { values: spacing, type: ["length", "number", "percentage"] }
      );

      // space-y-{n}  ->  row-gap: {n}
      matchUtilities(
        { "space-y": (value) => ({ rowGap: value }) },
        { values: spacing, type: ["length", "number", "percentage"] }
      );
    }),
  ],
};
