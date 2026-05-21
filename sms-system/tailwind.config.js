/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lamaSky: "#C3EBFA",
        lamaSkyLight: "#EDF9FD",
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
