import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { AppConfig, config } from './config';
import { DecisionProviderType, DECISION_PRESETS, DecisionProviderConfig } from './types';

export const DecisionProviderConfigSchema = z.object({
  provider: z.enum(['ollama', 'liquid', 'custom']),
  endpoint: z.string(),
  model: z.string(),
  apiKey: z.string().optional(),
  timeoutMs: z.coerce.number().min(100).max(60000).default(10000),
});

export const UpdateDecisionProviderSchema = z.object({
  provider: z.enum(['ollama', 'liquid', 'custom']),
  endpoint: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  timeoutMs: z.coerce.number().min(100).max(60000).optional(),
});

export function maskApiKey(apiKey?: string): string | null {
  if (!apiKey || apiKey.trim().length === 0) return null;
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return '****' + trimmed.slice(-2);
  }
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function loadDecisionProviderConfig(
  filePath: string = 'config/decision-provider.json',
  appConfig: AppConfig = config
): DecisionProviderConfig {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

  if (fs.existsSync(resolved)) {
    try {
      const content = fs.readFileSync(resolved, 'utf-8');
      const parsed = JSON.parse(content);
      return DecisionProviderConfigSchema.parse(parsed);
    } catch (err: any) {
      console.warn(`[BYOK] Failed to load config from ${filePath}, falling back to env/defaults:`, err?.message);
    }
  }

  // Fallback to appConfig / environment
  const provider = (appConfig.DECISION_PROVIDER || 'ollama') as DecisionProviderType;
  const preset = DECISION_PRESETS[provider] || DECISION_PRESETS.ollama;

  return {
    provider,
    endpoint: appConfig.DECISION_ENDPOINT || appConfig.D1_ENDPOINT || preset.defaultEndpoint,
    model: appConfig.DECISION_MODEL || appConfig.D1_MODEL || preset.defaultModel,
    apiKey: appConfig.DECISION_API_KEY,
    timeoutMs: appConfig.DECISION_TIMEOUT_MS || appConfig.D1_TIMEOUT_MS || 10000,
  };
}

export function saveDecisionProviderConfig(
  filePath: string = 'config/decision-provider.json',
  configToSave: DecisionProviderConfig
): void {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const tmpPath = `${resolved}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(configToSave, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    try {
      fs.chmodSync(tmpPath, 0o600);
    } catch {
      // Ignore chmod error on non-POSIX filesystems
    }
    fs.renameSync(tmpPath, resolved);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore cleanup error
      }
    }
    throw err;
  }
}
