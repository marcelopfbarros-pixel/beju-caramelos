import React, { useEffect, useRef, useState } from 'react';

interface PrincessWalkProps {
  active: boolean;
  onComplete: () => void;
}

interface Waypoint {
  x: number;
  y: number;
  facingLeft: boolean;
  scale: number;
}

function randomWaypoint(prevX?: number): Waypoint {
  const x = 10 + Math.random() * 78; // 10vw - 88vw
  const y = 15 + Math.random() * 67; // 15vh - 82vh
  const facingLeft = prevX !== undefined ? x < prevX : Math.random() < 0.5;
  return {
    x,
    y,
    facingLeft,
    scale: 0.92 + Math.random() * 0.22,
  };
}

export const PrincessWalk: React.FC<PrincessWalkProps> = ({ active, onComplete }) => {
  const [pos, setPos] = useState<Waypoint>(() => randomWaypoint());
  const [phase, setPhase] = useState<'walking' | 'message'>('walking');
  const [fadingOut, setFadingOut] = useState(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) return;

    setPhase('walking');
    setFadingOut(false);
    const start = randomWaypoint();
    setPos(start);

    const kickTimeout = setTimeout(() => {
      setPos(prev => randomWaypoint(prev.x));
    }, 50);

    const moveInterval = setInterval(() => {
      setPos(prev => randomWaypoint(prev.x));
    }, 650);

    // 3s walking across screen (fade out during last 350ms)
    const fadePrincessTimeout = setTimeout(() => {
      setFadingOut(true);
    }, 2650);

    // Switch to "Olá, princesa!" message at 3000ms for 2s
    const showMessageTimeout = setTimeout(() => {
      clearInterval(moveInterval);
      setFadingOut(false);
      setPhase('message');
    }, 3000);

    // Fade out message before disappearing at 5000ms
    const fadeMessageTimeout = setTimeout(() => {
      setFadingOut(true);
    }, 4650);

    const doneTimeout = setTimeout(() => {
      onCompleteRef.current();
    }, 5000);

    return () => {
      clearTimeout(kickTimeout);
      clearInterval(moveInterval);
      clearTimeout(fadePrincessTimeout);
      clearTimeout(showMessageTimeout);
      clearTimeout(fadeMessageTimeout);
      clearTimeout(doneTimeout);
    };
  }, [active]);

  if (!active) return null;

  if (phase === 'message') {
    return (
      <div
        className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center p-4"
        aria-live="polite"
      >
        <div
          style={{
            opacity: fadingOut ? 0 : 1,
            transition: 'opacity 350ms ease-out, transform 350ms ease-out',
            transform: fadingOut ? 'scale(0.95)' : 'scale(1)',
          }}
          className="px-5 py-3.5 sm:px-7 sm:py-4 rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl border-2 border-pink-200 flex items-center gap-3 animate-in fade-in zoom-in-95 duration-200 max-w-full"
        >
          <span className="text-xl sm:text-3xl" aria-hidden="true">
            👑
          </span>
          <span
            style={{
              backgroundImage: 'linear-gradient(90deg, #ec4899, #a855f7, #f59e0b, #06b6d4)',
            }}
            className="text-2xl sm:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent whitespace-nowrap"
          >
            Olá, princesa!
          </span>
          <span className="text-xl sm:text-3xl" aria-hidden="true">
            ✨
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
        @keyframes princess-bounce {
          0%, 100% { transform: translateY(0px) rotate(-2deg); }
          50% { transform: translateY(-6px) rotate(2deg); }
        }
        @keyframes princess-sparkle {
          0%, 100% { opacity: 0.35; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
      <div
        style={{
          left: `${pos.x}vw`,
          top: `${pos.y}vh`,
          transform: `translate(-50%, -50%) scale(${pos.scale})`,
          transition:
            'left 650ms cubic-bezier(0.45, 0.05, 0.55, 0.95), top 650ms cubic-bezier(0.45, 0.05, 0.55, 0.95), transform 400ms ease-out, opacity 350ms ease-out',
          opacity: fadingOut ? 0 : 1,
        }}
        className="absolute drop-shadow-lg"
      >
        <div
          style={{
            transform: pos.facingLeft ? 'scaleX(-1)' : 'scaleX(1)',
            transition: 'transform 220ms ease-out',
          }}
        >
          <div style={{ animation: 'princess-bounce 340ms ease-in-out infinite' }}>
            <svg
              width="60"
              height="70"
              viewBox="0 0 64 76"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="princessDressGrad" x1="16" y1="38" x2="48" y2="70" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#f472b6" />
                  <stop offset="45%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
                <linearGradient id="princessSkirtOverlay" x1="20" y1="42" x2="44" y2="68" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#fda4af" />
                  <stop offset="100%" stopColor="#fcd34d" />
                </linearGradient>
                <linearGradient id="princessCrownGrad" x1="22" y1="4" x2="42" y2="16" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#fde047" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>

              {/* Sparkles */}
              <circle
                cx="10"
                cy="24"
                r="2.2"
                fill="#fde047"
                style={{ transformOrigin: '10px 24px', animation: 'princess-sparkle 700ms ease-in-out infinite' }}
              />
              <circle
                cx="54"
                cy="18"
                r="2"
                fill="#f472b6"
                style={{ transformOrigin: '54px 18px', animation: 'princess-sparkle 600ms ease-in-out 200ms infinite' }}
              />
              <circle
                cx="52"
                cy="48"
                r="1.8"
                fill="#22d3ee"
                style={{ transformOrigin: '52px 48px', animation: 'princess-sparkle 650ms ease-in-out 100ms infinite' }}
              />

              {/* Back Hair */}
              <path
                d="M19 23 C14 31, 14 42, 20 45 L44 45 C50 42, 50 31, 45 23 Z"
                fill="#78350f"
              />

              {/* Golden Crown with Jewels */}
              <path
                d="M23 16 L21 7 L27.5 11.5 L32 4.5 L36.5 11.5 L43 7 L41 16 Z"
                fill="url(#princessCrownGrad)"
                stroke="#b45309"
                strokeWidth="1"
                strokeLinejoin="round"
              />
              <circle cx="32" cy="11.5" r="1.7" fill="#ec4899" />
              <circle cx="26" cy="13" r="1.2" fill="#06b6d4" />
              <circle cx="38" cy="13" r="1.2" fill="#a855f7" />

              {/* Head & Face */}
              <circle cx="32" cy="26" r="10.5" fill="#fde6d8" stroke="#f5cbb7" strokeWidth="0.8" />
              {/* Bangs */}
              <path
                d="M21.5 23 C23 16, 41 16, 42.5 23 C39 19.5, 34 20.5, 32 19 C30 20.5, 25 19.5, 21.5 23 Z"
                fill="#92400e"
              />
              {/* Eyes & Smile */}
              <circle cx="28.3" cy="26.5" r="1.35" fill="#1e293b" />
              <circle cx="35.7" cy="26.5" r="1.35" fill="#1e293b" />
              <circle cx="28.8" cy="26" r="0.45" fill="#ffffff" />
              <circle cx="36.2" cy="26" r="0.45" fill="#ffffff" />
              {/* Rosy Cheeks */}
              <ellipse cx="25.2" cy="29" rx="2" ry="1.2" fill="#fda4af" opacity="0.85" />
              <ellipse cx="38.8" cy="29" rx="2" ry="1.2" fill="#fda4af" opacity="0.85" />
              {/* Smile */}
              <path d="M29.5 30.2 Q32 32.5 34.5 30.2" stroke="#be185d" strokeWidth="1.2" strokeLinecap="round" fill="none" />

              {/* Arms & Magic Wand */}
              <path d="M25 39 L16 45" stroke="#fde6d8" strokeWidth="3.2" strokeLinecap="round" />
              <path d="M39 39 L48 41" stroke="#fde6d8" strokeWidth="3.2" strokeLinecap="round" />
              {/* Wand */}
              <line x1="48" y1="41" x2="54" y2="29" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />
              <path
                d="M54 24 L55.4 27.2 L58.8 27.6 L56.2 29.8 L56.9 33.2 L54 31.4 L51.1 33.2 L51.8 29.8 L49.2 27.6 L52.6 27.2 Z"
                fill="#fde047"
                stroke="#f59e0b"
                strokeWidth="0.7"
              />

              {/* Colorful Princess Bodice & Layered Skirt */}
              <path
                d="M26 36 L38 36 L40 44 L24 44 Z"
                fill="#ec4899"
                stroke="#be185d"
                strokeWidth="0.9"
              />
              <path
                d="M24 44 C17 51, 13 61, 14 66 C23 69, 41 69, 50 66 C51 61, 47 51, 40 44 Z"
                fill="url(#princessDressGrad)"
                stroke="#9333ea"
                strokeWidth="1"
              />
              {/* Golden/Peach Center Overskirt */}
              <path
                d="M28 44 C26 52, 25 60, 26 67 C30 68, 34 68, 38 67 C39 60, 38 52, 36 44 Z"
                fill="url(#princessSkirtOverlay)"
                opacity="0.88"
              />
              {/* Waist Ribbon */}
              <rect x="24" y="42.5" width="16" height="2.6" rx="1.3" fill="#fde047" />

              {/* Little Shoes */}
              <ellipse cx="26" cy="70" rx="3.4" ry="2.1" fill="#ec4899" />
              <ellipse cx="38" cy="70" rx="3.4" ry="2.1" fill="#ec4899" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
