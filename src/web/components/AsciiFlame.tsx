import { useState, useEffect, useMemo } from 'react';
import { ProceduralAsciiWave } from './ProceduralAsciiWave';

const FLAME_FRAMES = [
  `  .  .  :  .  *  #  @  #  *  .  :  .
  :  .  *  #  @  @  @  #  *  :  .  .
  .  *  #  @  #  *  *  #  @  *  .  :
  :  .  .  *  #  *  *  #  *  .  .  :`,
  `  :  .  *  #  @  #  #  @  #  *  .  .
  .  *  #  @  @  @  @  @  #  *  :  .
  :  .  *  #  @  #  *  #  @  #  *  :
  .  .  :  *  #  *  .  *  #  *  .  .`,
  `  .  :  .  *  #  @  @  #  *  .  :  .
  :  *  #  @  @  #  @  @  #  *  .  :
  .  .  *  #  @  #  *  #  @  *  :  .
  :  .  .  *  #  *  *  #  *  .  .  :`,
  `  .  .  *  #  @  #  *  #  @  #  *  .
  :  *  #  @  @  @  #  @  @  @  #  :
  .  :  *  #  @  #  *  #  @  #  *  .
  :  .  .  :  *  #  *  *  #  :  .  :`,
];

const MATRIX_FRAMES = [
  `  .  :  *  #  *  :  .  .  :  *  #  *
  :  *  #  @  #  *  :  .  *  #  @  #
  *  #  @  @  @  #  *  :  *  #  @  #
  :  *  #  @  #  *  :  .  :  *  #  *`,
  `  :  *  #  @  #  *  :  .  *  #  @  #
  *  #  @  @  @  #  *  :  *  #  @  #
  :  *  #  @  #  *  :  .  :  *  #  *
  .  :  *  #  *  :  .  .  :  *  #  *`,
  `  *  #  @  @  @  #  *  :  *  #  @  #
  :  *  #  @  #  *  :  .  :  *  #  *
  .  :  *  #  *  :  .  .  :  *  #  *
  :  *  #  @  #  *  :  .  *  #  @  #`,
  `  :  *  #  @  #  *  :  .  :  *  #  *
  .  :  *  #  *  :  .  .  :  *  #  *
  :  *  #  @  #  *  :  .  *  #  @  #
  *  #  @  @  @  #  *  :  *  #  @  #`,
];

const STREAM_FRAMES = [
  `  [01] > d1::eval(c=1.2) -> ok
  [02] > route.select    -> local
  [03] > stream.chunk    -> 49ms`,
  `  [02] > d1::eval(c=1.2) -> ok
  [03] > route.select    -> local
  [04] > stream.chunk    -> 48ms`,
  `  [03] > d1::eval(c=1.2) -> ok
  [04] > route.select    -> local
  [05] > stream.chunk    -> 50ms`,
  `  [04] > d1::eval(c=1.2) -> ok
  [05] > route.select    -> local
  [06] > stream.chunk    -> 49ms`,
];

interface AsciiFlameProps {
  className?: string;
  opacity?: number;
  variant?: 'flame' | 'matrix' | 'stream' | 'wave';
  repeatRows?: number;
  repeatCols?: number;
}

export function AsciiFlame({
  className = '',
  opacity = 0.25,
  variant = 'flame',
  repeatRows = 1,
  repeatCols = 1,
}: AsciiFlameProps) {
  if (variant === 'wave') {
    return <ProceduralAsciiWave className={className} opacity={opacity} />;
  }

  const [frameIndex, setFrameIndex] = useState(0);

  const frames =
    variant === 'matrix'
      ? MATRIX_FRAMES
      : variant === 'stream'
      ? STREAM_FRAMES
      : FLAME_FRAMES;

  useEffect(() => {
    // Respect prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, 85);

    return () => clearInterval(timer);
  }, [frames.length]);

  const renderedContent = useMemo(() => {
    const raw = frames[frameIndex] || '';
    if (repeatRows <= 1 && repeatCols <= 1) {
      return raw;
    }
    const lines = raw.split('\n');
    const result: string[] = [];
    for (let r = 0; r < repeatRows; r++) {
      for (const line of lines) {
        let repeatedLine = '';
        for (let c = 0; c < repeatCols; c++) {
          repeatedLine += (c > 0 ? '  ' : '') + line.trimEnd();
        }
        result.push(repeatedLine);
      }
    }
    return result.join('\n');
  }, [frames, frameIndex, repeatRows, repeatCols]);

  const hasColor = /text-/.test(className);
  const colorClass = hasColor ? '' : 'text-heat-100';

  return (
    <pre
      aria-hidden="true"
      style={{ opacity }}
      className={`font-mono text-[10px] leading-[13px] select-none pointer-events-none transition-opacity ${colorClass} ${className}`}
    >
      {renderedContent}
    </pre>
  );
}
