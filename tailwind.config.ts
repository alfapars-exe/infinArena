import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        inf: {
          red: "#BA2031",
          darkGray: "#414042",
          black: "#231F20",
          cream: "#FAEEEF",
          turquoise: "#3EBEB4",
          yellow: "#FBB615",
          blue: "#0C4D99",
          purple: "#863B96",
          green: "#20AE4C",
          orange: "#F15C35",
          pistachio: "#C5D931",
          grayBlue: "#778BA2",
        },
      },
      animation: {
        "bounce-in": "bounceIn 0.5s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "score-pop": "scorePop 0.6s ease-out",
        "streak-fire": "streakFire 0.6s ease-out",
        "countdown-pulse": "countdownPulse 1s ease-in-out",
        "rank-change": "rankChange 0.5s ease-out",
      },
      keyframes: {
        bounceIn: {
          "0%": { transform: "scale(0.3)", opacity: "0" },
          "50%": { transform: "scale(1.05)" },
          "70%": { transform: "scale(0.9)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        scorePop: {
          "0%": { transform: "scale(0.5) translateY(0)", opacity: "0" },
          "50%": { transform: "scale(1.2) translateY(-20px)", opacity: "1" },
          "100%": { transform: "scale(1) translateY(-40px)", opacity: "0" },
        },
        streakFire: {
          "0%": { transform: "scale(0.5) rotate(-10deg)", opacity: "0" },
          "50%": { transform: "scale(1.3) rotate(5deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        countdownPulse: {
          "0%": { transform: "scale(0.3)", opacity: "0" },
          "50%": { transform: "scale(1.1)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "0" },
        },
        rankChange: {
          "0%": { transform: "translateX(-20px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
