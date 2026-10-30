import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigSchema } from '../../src/core/config';

describe('App Config', () => {
  it('should load default configuration values when empty object is passed', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(8100);
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.D1_ENDPOINT).toBe('http://localhost:11434/v1/systemone');
    expect(config.D1_MODEL).toBe('d1:latest');
    expect(config.D1_TIMEOUT_MS).toBe(10000);
    expect(config.DEFAULT_POLICY).toBe('balanced');
    expect(config.FALLBACK_MODEL_ID).toBe('lfm3-local');
    expect(config.REGISTRY_PATH).toBe('config/registry.yaml');
    expect(config.OPENAI_API_KEY).toBeUndefined();
    expect(config.ANTHROPIC_API_KEY).toBeUndefined();
    expect(config.OPENROUTER_API_KEY).toBeUndefined();
    expect(config.DECISION_PROVIDER).toBe('ollama');
    expect(config.DECISION_API_KEY).toBeUndefined();
    expect(config.DECISION_ENDPOINT).toBeUndefined();
    expect(config.DECISION_MODEL).toBeUndefined();
    expect(config.DECISION_TIMEOUT_MS).toBe(10000);
  });

  it('should parse and coerce custom environment overrides', () => {
    const customEnv = {
      PORT: '9000',
      HOST: '127.0.0.1',
      D1_ENDPOINT: 'http://ai-server:11434/v1/systemone',
      D1_MODEL: 'd1:fast',
      D1_TIMEOUT_MS: '300',
      DECISION_PROVIDER: 'liquid',
      DECISION_API_KEY: 'sk-liq-testkey',
      DECISION_ENDPOINT: 'https://api.liquid.ai/v1/systemone',
      DECISION_MODEL: 'd1',
      DECISION_TIMEOUT_MS: '5000',
      DEFAULT_POLICY: 'cost_optimized',
      FALLBACK_MODEL_ID: 'gpt-4o-mini',
      REGISTRY_PATH: 'custom/path/registry.yaml',
      OPENAI_API_KEY: 'sk-openai-key',
      ANTHROPIC_API_KEY: 'sk-ant-key',
      OPENROUTER_API_KEY: 'sk-or-key',
    };

    const config = loadConfig(customEnv);
    expect(config.PORT).toBe(9000);
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.D1_ENDPOINT).toBe('http://ai-server:11434/v1/systemone');
    expect(config.D1_MODEL).toBe('d1:fast');
    expect(config.D1_TIMEOUT_MS).toBe(300);
    expect(config.DECISION_PROVIDER).toBe('liquid');
    expect(config.DECISION_API_KEY).toBe('sk-liq-testkey');
    expect(config.DECISION_ENDPOINT).toBe('https://api.liquid.ai/v1/systemone');
    expect(config.DECISION_MODEL).toBe('d1');
    expect(config.DECISION_TIMEOUT_MS).toBe(5000);
    expect(config.DEFAULT_POLICY).toBe('cost_optimized');
    expect(config.FALLBACK_MODEL_ID).toBe('gpt-4o-mini');
    expect(config.REGISTRY_PATH).toBe('custom/path/registry.yaml');
    expect(config.OPENAI_API_KEY).toBe('sk-openai-key');
    expect(config.ANTHROPIC_API_KEY).toBe('sk-ant-key');
    expect(config.OPENROUTER_API_KEY).toBe('sk-or-key');
  });

  it('should support all allowed decision providers', () => {
    const providers = ['ollama', 'liquid', 'custom'] as const;
    for (const provider of providers) {
      const config = loadConfig({ DECISION_PROVIDER: provider });
      expect(config.DECISION_PROVIDER).toBe(provider);
    }
  });

  it('should throw validation error on invalid DECISION_PROVIDER', () => {
    expect(() => loadConfig({ DECISION_PROVIDER: 'invalid_provider' as any })).toThrow();
  });

  it('should support all allowed routing policies', () => {
    const policies = ['balanced', 'cost_optimized', 'quality_max', 'local_first'] as const;
    for (const policy of policies) {
      const config = loadConfig({ DEFAULT_POLICY: policy });
      expect(config.DEFAULT_POLICY).toBe(policy);
    }
  });

  it('should throw validation error on invalid DEFAULT_POLICY', () => {
    expect(() => loadConfig({ DEFAULT_POLICY: 'invalid_policy' as any })).toThrow();
  });

  it('should throw validation error on invalid PORT value', () => {
    expect(() => loadConfig({ PORT: 'not-a-number' })).toThrow();
  });

  it('should export ConfigSchema for external schema composition', () => {
    expect(ConfigSchema).toBeDefined();
    const parsed = ConfigSchema.parse({});
    expect(parsed.PORT).toBe(8100);
  });
});
