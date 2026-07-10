"use client";

/* ============================================================
   SQUARE LOADER — 7 carrés qui parcourent un circuit.
   Version CSS pure (sans styled-components) du loader fourni.
   Affiché pendant que Suzanne réfléchit.
   ============================================================ */

export default function SquareLoader() {
  return (
    <div className="suzanne-square-loader">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="loader-square" />
      ))}
      <style>{`
        .suzanne-square-loader {
          position: relative;
          width: 48px;
          height: 48px;
          transform: rotate(45deg) scale(0.5);
          transform-origin: top left;
        }
        .suzanne-square-loader .loader-square {
          position: absolute;
          top: 0;
          left: 0;
          width: 28px;
          height: 28px;
          margin: 2px;
          border-radius: 2px;
          background: #6366f1;
          animation: suzanne-square-anim 10s ease-in-out infinite both;
        }
        .suzanne-square-loader .loader-square:nth-of-type(1) { animation-delay: -1.4285714286s; }
        .suzanne-square-loader .loader-square:nth-of-type(2) { animation-delay: -2.8571428571s; }
        .suzanne-square-loader .loader-square:nth-of-type(3) { animation-delay: -4.2857142857s; }
        .suzanne-square-loader .loader-square:nth-of-type(4) { animation-delay: -5.7142857143s; }
        .suzanne-square-loader .loader-square:nth-of-type(5) { animation-delay: -7.1428571429s; }
        .suzanne-square-loader .loader-square:nth-of-type(6) { animation-delay: -8.5714285714s; }
        .suzanne-square-loader .loader-square:nth-of-type(7) { animation-delay: -10s; }

        @keyframes suzanne-square-anim {
          0%     { left: 0;    top: 0; }
          10.5%  { left: 0;    top: 0; }
          12.5%  { left: 32px; top: 0; }
          23%    { left: 32px; top: 0; }
          25%    { left: 64px; top: 0; }
          35.5%  { left: 64px; top: 0; }
          37.5%  { left: 64px; top: 32px; }
          48%    { left: 64px; top: 32px; }
          50%    { left: 32px; top: 32px; }
          60.5%  { left: 32px; top: 32px; }
          62.5%  { left: 32px; top: 64px; }
          73%    { left: 32px; top: 64px; }
          75%    { left: 0;    top: 64px; }
          85.5%  { left: 0;    top: 64px; }
          87.5%  { left: 0;    top: 32px; }
          98%    { left: 0;    top: 32px; }
          100%   { left: 0;    top: 0; }
        }
      `}</style>
    </div>
  );
}
