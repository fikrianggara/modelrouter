import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  saveDecisionProviderConfig,
  loadDecisionProviderConfig,
  maskApiKey,
} from '../../src/core/decision-config';
import { DecisionProviderConfig } from '../../src/core/types';

describe('Decision Config Unit Tests (TKT-027 / VULN-12)', () => {
  it('masks API keys correctly', () => {
    expect(maskApiKey(undefined)).toBeNull();
    expect(maskApiKey('')).toBeNull();
    expect(maskApiKey('12345')).toBe('****45');
    expect(maskApiKey('sk-1234567890abcdef')).toBe('sk-123...cdef');
  });

  it('performs atomic write with 0o600 permissions in saveDecisionProviderConfig', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-byok-test-'));
    const targetFile = path.join(tmpDir, 'decision-provider.json');

    const config: DecisionProviderConfig = {
      provider: 'liquid',
      endpoint: 'https://api.liquid.ai/v1',
      model: 'liquid-d1',
      apiKey: 'liquid-secret-key-123',
      timeoutMs: 5000,
    };

    saveDecisionProviderConfig(targetFile, config);

    expect(fs.existsSync(targetFile)).toBe(true);
    const loaded = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    expect(loaded.provider).toBe('liquid');
    expect(loaded.apiKey).toBe('liquid-secret-key-123');

    // Check file permissions (on POSIX systems, check lowest 9 bits)
    const stats = fs.statSync(targetFile);
    const mode = stats.mode & 0o777;
    expect(mode & 0o077).toBe(0); // No access for group and others

    // Test persistence error handling and non-corruption
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('Simulated rename error');
    });

    expect(() => saveDecisionProviderConfig(targetFile, {
      ...config,
      model: 'corrupted-model',
    })).toThrow('Simulated rename error');
    renameSpy.mockRestore();

    // Verify existing file remains unchanged and uncorrupted
    const intact = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    expect(intact.model).toBe('liquid-d1');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads decision provider config from file with fallback', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-byok-test-'));
    const targetFile = path.join(tmpDir, 'decision-provider.json');

    const testConfig: DecisionProviderConfig = {
      provider: 'custom',
      endpoint: 'http://localhost:5000/v1',
      model: 'custom-d1',
      timeoutMs: 8000,
    };
    saveDecisionProviderConfig(targetFile, testConfig);

    const loaded = loadDecisionProviderConfig(targetFile);
    expect(loaded.provider).toBe('custom');
    expect(loaded.endpoint).toBe('http://localhost:5000/v1');

    // Non-existent file falls back to defaults
    const fallback = loadDecisionProviderConfig(path.join(tmpDir, 'non-existent.json'));
    expect(fallback.provider).toBeDefined();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
