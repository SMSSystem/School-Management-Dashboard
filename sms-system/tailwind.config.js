/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lamaSky:          "color-mix(in srgb, var(--brand-accent) 30%, white)",
        lamaSkyLight:     "color-mix(in srgb, var(--brand-accent) 10%, white)",
        lamaSidebarText:  "color-mix(in srgb, var(--brand-accent) 65%, #0f172a)",
        lamaSidebarRing:  "color-mix(in srgb, var(--brand-accent) 20%, white)",
        lamaYellow: "#FAE27C",
        lamaYellowLight: "#FEFCE8",
        lamaPurple: "#CFCEFF",
        lamaPurpleLight: "#F1F0FF",
      },
    },
  },
  darkMode: 'class',
  plugins: [],
}
