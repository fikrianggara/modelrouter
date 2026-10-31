import { z } from 'zod';

export const ConfigSchema = z.object({
  PORT: z.coerce.number().default(8100),
  HOST: z.string().default('127.0.0.1'),
  ADMIN_API_KEY: z.string().optional(),
  D1_ENDPOINT: z.string().default('http://localhost:11434/v1/systemone'),
  D1_MODEL: z.string().default('d1:latest'),
  D1_TIMEOUT_MS: z.coerce.number().default(10000),
  DECISION_PROVIDER: z.enum(['ollama', 'liquid', 'custom']).default('ollama'),
  DECISION_API_KEY: z.string().optional(),
  DECISION_ENDPOINT: z.string().optional(),
  DECISION_MODEL: z.string().optional(),
  DECISION_TIMEOUT_MS: z.coerce.number().default(10000),
  DEFAULT_POLICY: z.enum(['balanced', 'cost_optimized', 'quality_max', 'local_first']).default('balanced'),
  FALLBACK_MODEL_ID: z.string().default('lfm3-local'),
  REGISTRY_PATH: z.string().default('config/registry.yaml'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return ConfigSchema.parse(env);
}

export const config = loadConfig();
