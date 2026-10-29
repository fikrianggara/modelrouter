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
  enabled: z.boolean().default(true),
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
  includeDisabled?: boolean;
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

  getAllModels(includeDisabled: boolean = true): ModelSpec[] {
    return includeDisabled
      ? this.models
      : this.models.filter(m => m.enabled !== false);
  }

  findCandidates(criteria: CandidateCriteria = {}): ModelSpec[] {
    return this.models.filter(m => {
      if (!criteria.includeDisabled && m.enabled === false) return false;
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

  addModel(model: ModelSpec): void {
    const existingIndex = this.models.findIndex(m => m.id === model.id);
    if (existingIndex >= 0) {
      throw new Error(`Model with id "${model.id}" already exists.`);
    }
    const validated = ModelSpecSchema.parse(model);
    this.models.push(validated);
  }

  updateModel(id: string, updates: Partial<ModelSpec>): ModelSpec {
    const existingIndex = this.models.findIndex(m => m.id === id);
    if (existingIndex === -1) {
      throw new Error(`Model with id "${id}" not found.`);
    }
    const updated = {
      ...this.models[existingIndex],
      ...updates,
      id, // Preserve ID
    };
    const validated = ModelSpecSchema.parse(updated);
    this.models[existingIndex] = validated;
    return validated;
  }

  deleteModel(id: string): boolean {
    const initialLength = this.models.length;
    this.models = this.models.filter(m => m.id !== id);
    return this.models.length < initialLength;
  }

  toggleModel(id: string, enabled?: boolean): ModelSpec {
    const existing = this.getModel(id);
    if (!existing) {
      throw new Error(`Model with id "${id}" not found.`);
    }
    const newEnabled = enabled !== undefined ? enabled : !existing.enabled;
    return this.updateModel(id, { enabled: newEnabled });
  }

  saveToFile(filePath: string): void {
    const config: RegistryConfig = {
      version: '1.0',
      models: this.models,
    };
    const yamlString = YAML.stringify(config);
    fs.writeFileSync(filePath, yamlString, 'utf-8');
  }
}
