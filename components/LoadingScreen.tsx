import React, { useEffect } from 'react';

/**
 * Экран загрузки — логотип eToro.
 * Текст «eToro» с акцентом на «e», подзаголовок «Trade & Invest».
 *
 * FIX: таймаут-fallback 2000ms гарантирует продолжение работы даже если
 * onAnimationEnd не сработает (Android WebView, SVG-анимации).
 */
interface LoadingScreenProps {
  onAnimationComplete?: () => void;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ onAnimationComplete }) => {
  useEffect(() => {
    const timer = setTimeout(() => onAnimationComplete?.(), 600);
    return () => clearTimeout(timer);
  }, [onAnimationComplete]);

  return (
  <div className="h-[100dvh] w-full bg-background flex items-center justify-center overflow-hidden">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 600"
      className="w-full h-full max-h-[100vh] object-contain"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <style>
        {`
          .etoro-brand {
            opacity: 0;
            transform: translateY(16px);
            animation: etoroReveal 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.15s forwards;
          }
          .etoro-e {
            fill: #21B053;
          }
          .etoro-toro {
            fill: #FFFFFF;
          }
          .etoro-tagline {
            opacity: 0;
            letter-spacing: 0.2em;
            animation: etoroTagline 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.5s forwards;
          }
          @keyframes etoroReveal {
            0% { opacity: 0; transform: translateY(16px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes etoroTagline {
            0% { opacity: 0; transform: translateY(6px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>

      <g
        textAnchor="middle"
        style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, sans-serif" }}
      >
        <text
          className="etoro-brand"
          x="400"
          y="320"
          fontSize="72"
          fontWeight="700"
        >
          <tspan className="etoro-e">e</tspan>
          <tspan className="etoro-toro">Toro</tspan>
        </text>
        <text
          className="etoro-tagline"
          x="400"
          y="380"
          fontSize="13"
          fill="#6B7280"
          fontWeight="500"
        >
          TRADE & INVEST
        </text>
      </g>
    </svg>
  </div>
  );
};

export default LoadingScreen;
