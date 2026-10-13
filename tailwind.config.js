/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#20251f",
        muted: "#858a80",
        canvas: "#f7f7f3",
        line: "#e8e9e2",
        olive: "#405344",
        "olive-soft": "#e8eee8",
        citrus: "#d7ee9d",
        coral: "#e78464",
      },
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        display: ["Manrope", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 35px rgba(35, 45, 34, 0.045)",
        float: "0 18px 50px rgba(32, 37, 31, 0.14)",
      },
    },
  },
  plugins: [],
};
