import { useState, useEffect } from 'react';

const ASCII_FRAMES = [
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

interface AsciiFlameProps {
  className?: string;
  opacity?: number;
}

export function AsciiFlame({ className = '', opacity = 0.28 }: AsciiFlameProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    // Respect prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % ASCII_FRAMES.length);
    }, 90);

    return () => clearInterval(timer);
  }, []);

  return (
    <pre
      aria-hidden="true"
      style={{ opacity }}
      className={`font-mono text-[10px] leading-[13px] text-heat-100 select-none pointer-events-none transition-opacity ${className}`}
    >
      {ASCII_FRAMES[frameIndex]}
    </pre>
  );
}
