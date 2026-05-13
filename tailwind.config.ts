import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      boxShadow: {
        soft: "0 18px 60px rgba(15, 23, 42, 0.08)"
      },
      animation: {
        completeFlash: "completeFlash 650ms ease-out",
        reviewFlash: "reviewFlash 650ms ease-out"
      }
    }
  },
  plugins: []
};

export default config;
