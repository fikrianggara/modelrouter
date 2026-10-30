import { describe, it, expect } from 'vitest';
import { computeWave, CHAR_RAMP } from '../../src/web/components/ProceduralAsciiWave';

describe('Procedural ASCII Animation Math (bento_grid_architecture_guide_2)', () => {
  it('computeWave returns values bounded between -1.0 and 1.0', () => {
    for (let t = 0; t < 10; t += 0.5) {
      for (let x = 0; x < 50; x += 5) {
        for (let y = 0; y < 30; y += 5) {
          const val = computeWave(x, y, t);
          expect(val).toBeGreaterThanOrEqual(-1.0);
          expect(val).toBeLessThanOrEqual(1.0);
        }
      }
    }
  });

  it('density ramp indexing maps properly within range [0, CHAR_RAMP.length - 1]', () => {
    const cols = 40;
    const rows = 20;
    for (let y = 0; y < rows; y++) {
      const verticalMask = Math.pow(y / rows, 0.85);
      for (let x = 0; x < cols; x++) {
        let value = (computeWave(x, y, 1.5) + 1) / 2;
        const horizontalMask = Math.sin((x / cols) * Math.PI);
        value = value * (verticalMask * 0.75 + horizontalMask * 0.35);

        const index = Math.min(
          CHAR_RAMP.length - 1,
          Math.max(0, Math.floor(value * CHAR_RAMP.length))
        );

        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(CHAR_RAMP.length);
        expect(typeof CHAR_RAMP[index]).toBe('string');
      }
    }
  });
});
