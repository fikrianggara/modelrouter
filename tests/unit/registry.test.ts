import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ModelRegistry, ModelSpecSchema, ALLOWED_API_KEY_ENVS } from '../../src/engine/registry';

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

    it('should add, update, toggle, delete model and exclude disabled from candidates', () => {
      const editableReg = ModelRegistry.fromYaml(sampleYaml);
      expect(editableReg.models.length).toBe(3);

      // Add Model
      editableReg.addModel({
        id: 'new-model',
        display_name: 'New Custom Model',
        provider: 'custom',
        upstream_model: 'custom-v2',
        base_url: 'http://localhost:9000/v1',
        complexity_range: [1.0, 3.0],
        tags: ['custom', 'test'],
        capabilities: { tools: true, vision: false, max_context: 4096, streaming: true },
        cost: { input_per_mtoken: 0.5, output_per_mtoken: 1.0 },
        enabled: true,
      });
      expect(editableReg.models.length).toBe(4);
      expect(editableReg.getModel('new-model')).toBeDefined();

      // Duplicate add throws
      expect(() =>
        editableReg.addModel({
          id: 'new-model',
          provider: 'custom',
          upstream_model: 'custom-v2',
          base_url: 'http://localhost:9000/v1',
          complexity_range: [1.0, 3.0],
          tags: [],
          capabilities: { tools: true, vision: false, max_context: 4096, streaming: true },
          cost: { input_per_mtoken: 0, output_per_mtoken: 0 },
          enabled: true,
        })
      ).toThrow();

      // Update Model
      editableReg.updateModel('new-model', { display_name: 'Updated Custom Model' });
      expect(editableReg.getModel('new-model')?.display_name).toBe('Updated Custom Model');

      // Toggle Model (disable)
      editableReg.toggleModel('new-model', false);
      expect(editableReg.getModel('new-model')?.enabled).toBe(false);

      // Disabled model excluded from findCandidates by default
      const candidates = editableReg.findCandidates({ tag: 'custom' });
      expect(candidates.find(c => c.id === 'new-model')).toBeUndefined();

      // Disabled model included when includeDisabled: true
      const candidatesWithDisabled = editableReg.findCandidates({ tag: 'custom', includeDisabled: true });
      expect(candidatesWithDisabled.find(c => c.id === 'new-model')).toBeDefined();

      // Toggle Model back to true
      editableReg.toggleModel('new-model');
      expect(editableReg.getModel('new-model')?.enabled).toBe(true);

      // Delete Model
      const deleted = editableReg.deleteModel('new-model');
      expect(deleted).toBe(true);
      expect(editableReg.getModel('new-model')).toBeUndefined();
      expect(editableReg.models.length).toBe(3);
    });
  });

  describe('Security & Integrity (TKT-024 / VULN-01, VULN-07)', () => {
    const validBaseSpec = {
      id: 'sec-model',
      display_name: 'Sec Model',
      provider: 'custom' as const,
      upstream_model: 'custom-v1',
      base_url: 'https://api.example.com/v1',
      complexity_range: [1.0, 3.0] as [number, number],
      tags: ['security'],
      capabilities: { tools: true, vision: false, max_context: 4096, streaming: true },
      cost: { input_per_mtoken: 0, output_per_mtoken: 0 },
      enabled: true,
    };

    it('should reject arbitrary api_key_env outside allowlist', () => {
      expect(() => {
        ModelSpecSchema.parse({
          ...validBaseSpec,
          api_key_env: 'AWS_SECRET_ACCESS_KEY',
        });
      }).toThrow();

      expect(() => {
        ModelSpecSchema.parse({
          ...validBaseSpec,
          api_key_env: 'DATABASE_PASSWORD',
        });
      }).toThrow();
    });

    it('should allow valid api_key_env from allowlist or null/empty', () => {
      for (const envKey of ALLOWED_API_KEY_ENVS) {
        const parsed = ModelSpecSchema.parse({
          ...validBaseSpec,
          api_key_env: envKey,
        });
        expect(parsed.api_key_env).toBe(envKey);
      }

      const parsedNull = ModelSpecSchema.parse({
        ...validBaseSpec,
        api_key_env: null,
      });
      expect(parsedNull.api_key_env).toBeNull();

      const parsedEmpty = ModelSpecSchema.parse({
        ...validBaseSpec,
        api_key_env: '',
      });
      expect(parsedEmpty.api_key_env).toBeNull();
    });

    it('should validate base_url requiring http: or https: protocol', () => {
      expect(() => {
        ModelSpecSchema.parse({
          ...validBaseSpec,
          base_url: 'ftp://example.com/v1',
        });
      }).toThrow();

      expect(() => {
        ModelSpecSchema.parse({
          ...validBaseSpec,
          base_url: 'not-a-valid-url',
        });
      }).toThrow();

      const httpParsed = ModelSpecSchema.parse({
        ...validBaseSpec,
        base_url: 'http://localhost:8000/v1',
      });
      expect(httpParsed.base_url).toBe('http://localhost:8000/v1');

      const httpsParsed = ModelSpecSchema.parse({
        ...validBaseSpec,
        base_url: 'https://api.openai.com/v1',
      });
      expect(httpsParsed.base_url).toBe('https://api.openai.com/v1');
    });

    it('should perform atomic write in saveToFile and not corrupt file on failure', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-registry-test-'));
      const targetFile = path.join(tmpDir, 'registry.yaml');

      const originalContent = 'version: "1.0"\nmodels: []\n';
      fs.writeFileSync(targetFile, originalContent, 'utf-8');

      const reg = ModelRegistry.fromYaml(sampleYaml);
      reg.saveToFile(targetFile);

      // Verify file was written and is valid YAML
      const savedReg = ModelRegistry.fromFile(targetFile);
      expect(savedReg.models.length).toBe(3);

      // Verify failure during rename leaves target file untouched
      const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
        throw new Error('Simulated disk I/O error during rename');
      });

      expect(() => reg.saveToFile(targetFile)).toThrow('Simulated disk I/O error');
      renameSpy.mockRestore();

      // Original file still intact and readable
      const intactReg = ModelRegistry.fromFile(targetFile);
      expect(intactReg.models.length).toBe(3);

      // Clean up tmp directory
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});
