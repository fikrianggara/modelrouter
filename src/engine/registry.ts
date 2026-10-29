import fs from 'fs';
import YAML from 'yaml';
import { z } from 'zod';

export const ModelCapabilitiesSchema = z.object({
  tools: z.boolean().default(true),
  vision: z.boolean().default(false),
  max_context: z.number().default(32768),
  streaming: z.boolean().default(true),
});

export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;

export const ModelCostSchema = z.object({
  input_per_mtoken: z.number().default(0.0),
  output_per_mtoken: z.number().default(0.0),
});

export type ModelCost = z.infer<typeof ModelCostSchema>;

export const ModelProviderSchema = z.enum([
  'ollama',
  'openai',
  'anthropic',
  'openrouter',
  '9router',
  'custom',
]);

export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const ModelSpecSchema = z.object({
  id: z.string(),
  display_name: z.string().optional().default(''),
  provider: ModelProviderSchema,
  upstream_model: z.string(),
  base_url: z.string(),
  api_key_env: z.string().nullable().optional(),
  complexity_range: z.tuple([z.number(), z.number()]),
  tags: z.array(z.string()).default([]),
  capabilities: ModelCapabilitiesSchema.default({}),
  cost: ModelCostSchema.default({}),
});

export type ModelSpec = z.infer<typeof ModelSpecSchema>;

export const RegistryConfigSchema = z.object({
  version: z.string().or(z.number().transform(v => String(v))),
  models: z.array(ModelSpecSchema),
});

export type RegistryConfig = z.infer<typeof RegistryConfigSchema>;

export interface CandidateCriteria {
  complexity?: number;
  requiresTools?: boolean;
  requiresVision?: boolean;
  tag?: string;
  tags?: string[];
}

export class ModelRegistry {
  constructor(public models: ModelSpec[] = []) {}

  static fromYaml(yamlString: string): ModelRegistry {
    const parsed = YAML.parse(yamlString);
    const validated = RegistryConfigSchema.parse(parsed);
    return new ModelRegistry(validated.models);
  }

  static fromFile(filePath: string): ModelRegistry {
    const content = fs.readFileSync(filePath, 'utf-8');
    return ModelRegistry.fromYaml(content);
  }

  getModel(id: string): ModelSpec | undefined {
    return this.models.find(m => m.id === id);
  }

  getAllModels(): ModelSpec[] {
    return this.models;
  }

  findCandidates(criteria: CandidateCriteria = {}): ModelSpec[] {
    return this.models.filter(m => {
      if (criteria.requiresTools && !m.capabilities.tools) return false;
      if (criteria.requiresVision && !m.capabilities.vision) return false;
      if (criteria.tag && !m.tags.includes(criteria.tag)) return false;
      if (criteria.tags && criteria.tags.length > 0) {
        if (!criteria.tags.every(t => m.tags.includes(t))) return false;
      }
      if (criteria.complexity !== undefined) {
        const [min, max] = m.complexity_range;
        const margin = 0.2;
        const epsilon = 1e-9;
        if (
          criteria.complexity < min - margin - epsilon ||
          criteria.complexity > max + margin + epsilon
        ) {
          return false;
        }
      }
      return true;
    });
  }
}
