import { describe, it, expect } from 'vitest';
import path from 'path';
import { ModelRegistry, ModelSpecSchema } from '../../src/engine/registry';

const sampleYaml = `
version: "1.0"
models:
  - id: "local-chat"
    display_name: "Local Chat"
    provider: "ollama"
    upstream_model: "lfm3:latest"
    base_url: "http://localhost:11434/v1"
    complexity_range: [0.0, 1.8]
    tags: ["local", "chat"]
    capabilities:
      tools: false
      vision: false
      max_context: 32768
      streaming: true
    cost:
      input_per_mtoken: 0.0
      output_per_mtoken: 0.0
  - id: "cloud-coder"
    display_name: "Claude Sonnet"
    provider: "anthropic"
    upstream_model: "claude-3-5-sonnet-20241022"
    base_url: "https://api.anthropic.com/v1"
    api_key_env: "ANTHROPIC_API_KEY"
    complexity_range: [3.0, 5.0]
    tags: ["coding", "frontier", "tools"]
    capabilities:
      tools: true
      vision: true
      max_context: 200000
      streaming: true
    cost:
      input_per_mtoken: 3.0
      output_per_mtoken: 15.0
  - id: "openai-gpt4o"
    display_name: "OpenAI GPT-4o"
    provider: "openai"
    upstream_model: "gpt-4o"
    base_url: "https://api.openai.com/v1"
    api_key_env: "OPENAI_API_KEY"
    complexity_range: [2.5, 4.5]
    tags: ["cloud", "frontier", "tools", "vision"]
    capabilities:
      tools: true
      vision: true
      max_context: 128000
      streaming: true
    cost:
      input_per_mtoken: 2.5
      output_per_mtoken: 10.0
`;

describe('ModelRegistry', () => {
  describe('Schema Validation & Parsing', () => {
    it('should parse valid YAML string into ModelRegistry', () => {
      const reg = ModelRegistry.fromYaml(sampleYaml);
      expect(reg.models.length).toBe(3);

      const local = reg.getModel('local-chat');
      expect(local).toBeDefined();
      expect(local?.provider).toBe('ollama');
      expect(local?.upstream_model).toBe('lfm3:latest');
      expect(local?.base_url).toBe('http://localhost:11434/v1');
      expect(local?.complexity_range).toEqual([0.0, 1.8]);
      expect(local?.tags).toEqual(['local', 'chat']);
      expect(local?.capabilities).toEqual({
        tools: false,
        vision: false,
        max_context: 32768,
        streaming: true,
      });
      expect(local?.cost).toEqual({
        input_per_mtoken: 0.0,
        output_per_mtoken: 0.0,
      });
    });

    it('should parse from file path (config/registry.yaml)', () => {
      const registryFile = path.resolve(process.cwd(), 'config/registry.yaml');
      const reg = ModelRegistry.fromFile(registryFile);
      expect(reg.models.length).toBeGreaterThanOrEqual(3);

      const cloudCoder = reg.getModel('cloud-coder');
      expect(cloudCoder).toBeDefined();
      expect(cloudCoder?.provider).toBe('anthropic');
      expect(cloudCoder?.api_key_env).toBe('ANTHROPIC_API_KEY');
    });

    it('should reject invalid schema when required fields are missing', () => {
      const invalidYaml = `
version: "1.0"
models:
  - id: "broken-model"
    provider: "unsupported-provider"
`;
      expect(() => ModelRegistry.fromYaml(invalidYaml)).toThrow();
    });

    it('should validate ModelSpecSchema directly', () => {
      const validSpec = {
        id: 'test-model',
        display_name: 'Test Model',
        provider: 'custom',
        upstream_model: 'custom-v1',
        base_url: 'http://localhost:8000',
        complexity_range: [1.0, 3.0],
        tags: ['test'],
        capabilities: {
          tools: true,
          vision: false,
          max_context: 4096,
          streaming: true,
        },
        cost: {
          input_per_mtoken: 1.0,
          output_per_mtoken: 2.0,
        },
      };

      const parsed = ModelSpecSchema.parse(validSpec);
      expect(parsed.id).toBe('test-model');
      expect(parsed.provider).toBe('custom');
    });
  });

  describe('Candidate Filtering (findCandidates)', () => {
    const reg = ModelRegistry.fromYaml(sampleYaml);

    it('should return all models when no criteria are provided', () => {
      const candidates = reg.findCandidates({});
      expect(candidates.length).toBe(3);
    });

    it('should filter models requiring tools', () => {
      const candidates = reg.findCandidates({ requiresTools: true });
      expect(candidates.length).toBe(2);
      expect(candidates.map(c => c.id)).toEqual(['cloud-coder', 'openai-gpt4o']);
    });

    it('should filter models requiring vision', () => {
      const candidates = reg.findCandidates({ requiresVision: true });
      expect(candidates.length).toBe(2);
      expect(candidates.every(c => c.capabilities.vision)).toBe(true);
    });

    it('should filter models by single tag', () => {
      const candidates = reg.findCandidates({ tag: 'local' });
      expect(candidates.length).toBe(1);
      expect(candidates[0]?.id).toBe('local-chat');
    });

    it('should filter models by multiple tags', () => {
      const candidates = reg.findCandidates({ tags: ['frontier', 'vision'] });
      expect(candidates.length).toBe(1);
      expect(candidates[0]?.id).toBe('openai-gpt4o');
    });

    it('should filter models by exact complexity score', () => {
      const candidates = reg.findCandidates({ complexity: 1.0 });
      expect(candidates.length).toBe(1);
      expect(candidates[0]?.id).toBe('local-chat');
    });

    it('should respect 0.2 tolerance margin above range', () => {
      // local-chat range is [0.0, 1.8]. With 0.2 tolerance, 2.0 should match.
      const candidatesAtEdge = reg.findCandidates({ complexity: 2.0 });
      expect(candidatesAtEdge.some(c => c.id === 'local-chat')).toBe(true);

      // 2.1 is outside [0.0, 1.8] + 0.2 margin (max 2.0)
      const candidatesBeyondEdge = reg.findCandidates({ complexity: 2.1 });
      expect(candidatesBeyondEdge.some(c => c.id === 'local-chat')).toBe(false);
    });

    it('should respect 0.2 tolerance margin below range', () => {
      // cloud-coder range is [3.0, 5.0]. With 0.2 tolerance, 2.8 should match.
      const candidatesAtEdge = reg.findCandidates({ complexity: 2.8 });
      expect(candidatesAtEdge.some(c => c.id === 'cloud-coder')).toBe(true);

      // 2.7 is outside [3.0, 5.0] - 0.2 margin (min 2.8)
      const candidatesBeyondEdge = reg.findCandidates({ complexity: 2.7 });
      expect(candidatesBeyondEdge.some(c => c.id === 'cloud-coder')).toBe(false);
    });

    it('should combine multiple criteria', () => {
      const candidates = reg.findCandidates({
        complexity: 3.5,
        requiresTools: true,
        requiresVision: true,
        tag: 'coding',
      });
      expect(candidates.length).toBe(1);
      expect(candidates[0]?.id).toBe('cloud-coder');
    });

    it('should return empty array when no models match criteria', () => {
      const candidates = reg.findCandidates({
        tag: 'non-existent-tag',
      });
      expect(candidates).toEqual([]);
    });
  });

  describe('Registry Retrieval Methods', () => {
    const reg = ModelRegistry.fromYaml(sampleYaml);

    it('should get model by id', () => {
      expect(reg.getModel('cloud-coder')?.upstream_model).toBe('claude-3-5-sonnet-20241022');
      expect(reg.getModel('unknown')).toBeUndefined();
    });

    it('should return all models via getAllModels()', () => {
      expect(reg.getAllModels().length).toBe(3);
    });
  });
});
