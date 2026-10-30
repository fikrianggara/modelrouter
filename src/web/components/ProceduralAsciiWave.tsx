import { useEffect, useRef } from 'react';

interface ProceduralAsciiWaveProps {
  className?: string;
  opacity?: number;
}

// ponytail: fixed char dimensions (6.6x13); add dynamic font canvas measurement if custom font size needed.
export const CHAR_RAMP = "              .,'`:;-~=+*^#";

export function computeWave(x: number, y: number, t: number): number {
  const w1 = Math.sin(x * 0.055 + t);
  const w2 = Math.cos(y * 0.075 - t * 1.2);
  const w3 = Math.sin(x * 0.035 + y * 0.045 + t * 0.7);
  const dist = Math.sqrt(x * x + y * y);
  const w4 = Math.sin(dist * 0.04 - t * 0.9);
  return (w1 + w2 + w3 + w4) / 4;
}

export function ProceduralAsciiWave({
  className = '',
  opacity = 0.65,
}: ProceduralAsciiWaveProps) {
  const containerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    let tick = 0;
    const charWidth = 6.6;
    const charHeight = 13;

    const updateFrame = () => {
      if (!el) return;
      const width = el.clientWidth || 320;
      const height = el.clientHeight || 180;
      const cols = Math.floor(width / charWidth);
      const rows = Math.floor(height / charHeight);

      if (cols <= 0 || rows <= 0) return;

      let frameBuffer = '';
      for (let y = 0; y < rows; y++) {
        const verticalMask = Math.pow(y / rows, 0.85);
        for (let x = 0; x < cols; x++) {
          let value = (computeWave(x, y, tick) + 1) / 2;
          const horizontalMask = Math.sin((x / cols) * Math.PI);
          value = value * (verticalMask * 0.75 + horizontalMask * 0.35);

          const index = Math.min(
            CHAR_RAMP.length - 1,
            Math.max(0, Math.floor(value * CHAR_RAMP.length))
          );
          frameBuffer += CHAR_RAMP[index];
        }
        frameBuffer += '\n';
      }

      el.textContent = frameBuffer;
      tick += 0.03;
    };

    updateFrame();
    const interval = setInterval(updateFrame, 50); // 20 FPS retro terminal timing

    return () => clearInterval(interval);
  }, []);

  return (
    <pre
      ref={containerRef}
      style={{ opacity }}
      className={`absolute inset-0 font-mono text-[11px] leading-[13px] text-neutral-400/65 dark:text-neutral-500/40 select-none pointer-events-none overflow-hidden whitespace-pre ${className}`}
      aria-hidden="true"
    />
  );
}
