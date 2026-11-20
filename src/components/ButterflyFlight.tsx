import React, { useEffect, useState } from 'react';

interface ButterflyFlightProps {
  active: boolean;
  onComplete: () => void;
}

interface Waypoint {
  x: number;
  y: number;
  rotate: number;
  scale: number;
}

function randomWaypoint(prevX?: number, prevY?: number): Waypoint {
  const x = 10 + Math.random() * 78; // 10vw - 88vw
  const y = 12 + Math.random() * 72; // 12vh - 84vh
  let rotate = -25 + Math.random() * 50;
  if (prevX !== undefined && prevY !== undefined) {
    const dx = x - prevX;
    const dy = y - prevY;
    rotate = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  }
  return {
    x,
    y,
    rotate,
    scale: 0.9 + Math.random() * 0.35,
  };
}

export const ButterflyFlight: React.FC<ButterflyFlightProps> = ({ active, onComplete }) => {
  const [pos, setPos] = useState<Waypoint>(() => randomWaypoint());
  const [phase, setPhase] = useState<'flying' | 'message'>('flying');
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    if (!active) return;

    setPhase('flying');
    setFadingOut(false);
    const start = randomWaypoint();
    setPos(start);

    // Move to a new random waypoint right away and every 750ms
    const kickTimeout = setTimeout(() => {
      setPos(prev => randomWaypoint(prev.x, prev.y));
    }, 50);

    const moveInterval = setInterval(() => {
      setPos(prev => randomWaypoint(prev.x, prev.y));
    }, 750);

    const fadeButterflyTimeout = setTimeout(() => {
      setFadingOut(true);
    }, 4400);

    const showMessageTimeout = setTimeout(() => {
      clearInterval(moveInterval);
      setFadingOut(false);
      setPhase('message');
    }, 5000);

    const fadeMessageTimeout = setTimeout(() => {
      setFadingOut(true);
    }, 6600);

    const doneTimeout = setTimeout(() => {
      onComplete();
    }, 7000);

    return () => {
      clearTimeout(kickTimeout);
      clearInterval(moveInterval);
      clearTimeout(fadeButterflyTimeout);
      clearTimeout(showMessageTimeout);
      clearTimeout(fadeMessageTimeout);
      clearTimeout(doneTimeout);
    };
  }, [active, onComplete]);

  if (!active) return null;

  if (phase === 'message') {
    return (
      <div
        className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center"
        aria-live="polite"
      >
        <div
          style={{
            opacity: fadingOut ? 0 : 1,
            transition: 'opacity 400ms ease-out, transform 400ms ease-out',
            transform: fadingOut ? 'scale(0.96)' : 'scale(1)',
          }}
          className="px-8 py-4 rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl border-2 border-pink-200 animate-in fade-in zoom-in-95 duration-300"
        >
          <span className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-rose-500 via-amber-500 via-emerald-500 to-violet-600 bg-clip-text text-transparent">
            Fique bem!
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden"
      aria-hidden="true"
    >
      <style>{`
        @keyframes butterfly-wing-left {
          0%, 100% { transform: scaleX(1) rotateY(0deg); }
          50% { transform: scaleX(0.35) rotateY(55deg); }
        }
        @keyframes butterfly-wing-right {
          0%, 100% { transform: scaleX(1) rotateY(0deg); }
          50% { transform: scaleX(0.35) rotateY(-55deg); }
        }
      `}</style>
      <div
        style={{
          left: `${pos.x}vw`,
          top: `${pos.y}vh`,
          transform: `translate(-50%, -50%) rotate(${pos.rotate}deg) scale(${pos.scale})`,
          transition:
            'left 750ms cubic-bezier(0.45, 0.05, 0.55, 0.95), top 750ms cubic-bezier(0.45, 0.05, 0.55, 0.95), transform 500ms ease-out, opacity 600ms ease-out',
          opacity: fadingOut ? 0 : 1,
        }}
        className="absolute drop-shadow-md"
      >
        <svg
          width="44"
          height="44"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="wingGradL" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
            <linearGradient id="wingGradR" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="50%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>

          {/* Left Wings */}
          <g
            style={{
              transformOrigin: '32px 32px',
              animation: 'butterfly-wing-left 220ms ease-in-out infinite',
            }}
          >
            <path
              d="M31 29 C22 10, 4 12, 7 27 C9 34, 21 34, 31 31 Z"
              fill="url(#wingGradL)"
              stroke="#be185d"
              strokeWidth="1"
            />
            <path
              d="M31 32 C20 34, 10 43, 15 51 C20 57, 29 46, 31 34 Z"
              fill="url(#wingGradR)"
              stroke="#7c3aed"
              strokeWidth="1"
            />
            <circle cx="15" cy="23" r="2.2" fill="#fef08a" opacity="0.9" />
            <circle cx="20" cy="44" r="1.8" fill="#bae6fd" opacity="0.9" />
          </g>

          {/* Right Wings */}
          <g
            style={{
              transformOrigin: '32px 32px',
              animation: 'butterfly-wing-right 220ms ease-in-out infinite',
            }}
          >
            <path
              d="M33 29 C42 10, 60 12, 57 27 C55 34, 43 34, 33 31 Z"
              fill="url(#wingGradL)"
              stroke="#be185d"
              strokeWidth="1"
            />
            <path
              d="M33 32 C44 34, 54 43, 49 51 C44 57, 35 46, 33 34 Z"
              fill="url(#wingGradR)"
              stroke="#7c3aed"
              strokeWidth="1"
            />
            <circle cx="49" cy="23" r="2.2" fill="#fef08a" opacity="0.9" />
            <circle cx="44" cy="44" r="1.8" fill="#bae6fd" opacity="0.9" />
          </g>

          {/* Body & Antennae */}
          <rect x="30.5" y="21" width="3" height="22" rx="1.5" fill="#1e293b" />
          <path d="M31 22 C28 16, 25 14, 23 14" stroke="#1e293b" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M33 22 C36 16, 39 14, 41 14" stroke="#1e293b" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
};
