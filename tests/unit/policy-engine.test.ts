import { describe, it, expect } from 'vitest';
import { PolicyEngine, RoutingDecision, RoutingPolicy } from '../../src/engine/policy-engine';
import { ModelSpec } from '../../src/engine/registry';
import { D1EvaluationResult } from '../../src/engine/d1-client';

describe('PolicyEngine', () => {
  const mockLocalSmall: ModelSpec = {
    id: 'local-slm',
    display_name: 'Local SLM',
    provider: 'ollama',
    upstream_model: 'lfm3:latest',
    base_url: 'http://localhost:11434',
    complexity_range: [0.0, 2.0], // midpoint: 1.0
    tags: ['local', 'fast'],
    capabilities: { tools: true, vision: false, max_context: 32768, streaming: true },
    cost: { input_per_mtoken: 0, output_per_mtoken: 0 },
  };

  const mockLocalLarge: ModelSpec = {
    id: 'local-llm',
    display_name: 'Local LLM 70B',
    provider: 'ollama',
    upstream_model: 'llama3:70b',
    base_url: 'http://localhost:11434',
    complexity_range: [2.0, 4.0], // midpoint: 3.0
    tags: ['local', 'heavy'],
    capabilities: { tools: true, vision: false, max_context: 65536, streaming: true },
    cost: { input_per_mtoken: 0, output_per_mtoken: 0 },
  };

  const mockCloudMid: ModelSpec = {
    id: 'cloud-gpt4o-mini',
    display_name: 'GPT-4o Mini',
    provider: 'openai',
    upstream_model: 'gpt-4o-mini',
    base_url: 'https://api.openai.com/v1',
    complexity_range: [1.5, 3.5], // midpoint: 2.5
    tags: ['cloud', 'fast'],
    capabilities: { tools: true, vision: true, max_context: 128000, streaming: true },
    cost: { input_per_mtoken: 0.15, output_per_mtoken: 0.60 }, // total: 0.75
  };

  const mockCloudHigh: ModelSpec = {
    id: 'cloud-gpt4o',
    display_name: 'GPT-4o',
    provider: 'openai',
    upstream_model: 'gpt-4o',
    base_url: 'https://api.openai.com/v1',
    complexity_range: [2.5, 5.0], // midpoint: 3.75, ceiling: 5.0
    tags: ['cloud', 'frontier'],
    capabilities: { tools: true, vision: true, max_context: 128000, streaming: true },
    cost: { input_per_mtoken: 2.5, output_per_mtoken: 10.0 }, // total: 12.5
  };

  const mockCloudFrontier: ModelSpec = {
    id: 'cloud-claude-sonnet',
    display_name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    upstream_model: 'claude-3-5-sonnet',
    base_url: 'https://api.anthropic.com/v1',
    complexity_range: [3.0, 5.0], // midpoint: 4.0, ceiling: 5.0
    tags: ['cloud', 'frontier', 'coding'],
    capabilities: { tools: true, vision: true, max_context: 200000, streaming: true },
    cost: { input_per_mtoken: 3.0, output_per_mtoken: 15.0 }, // total: 18.0
  };

  const allModels: ModelSpec[] = [
    mockLocalSmall,
    mockLocalLarge,
    mockCloudMid,
    mockCloudHigh,
    mockCloudFrontier,
  ];

  describe('balanced policy', () => {
    it('should select model with midpoint distance closest to complexity score', () => {
      // Score 1.1: closest to mockLocalSmall (mid 1.0, dist 0.1) vs mockCloudMid (mid 2.5, dist 1.4)
      const res1 = PolicyEngine.resolve(allModels, { complexityScore: 1.1 }, 'balanced');
      expect(res1.selectedModel.id).toBe('local-slm');

      // Score 2.4: closest to mockCloudMid (mid 2.5, dist 0.1) vs mockLocalLarge (mid 3.0, dist 0.6)
      const res2 = PolicyEngine.resolve(allModels, { complexityScore: 2.4 }, 'balanced');
      expect(res2.selectedModel.id).toBe('cloud-gpt4o-mini');

      // Score 4.2: closest to mockCloudFrontier (mid 4.0, dist 0.2) vs mockCloudHigh (mid 3.75, dist 0.45)
      const res3 = PolicyEngine.resolve(allModels, { complexityScore: 4.2 }, 'balanced');
      expect(res3.selectedModel.id).toBe('cloud-claude-sonnet');
    });

    it('should default to balanced policy when policy argument is omitted', () => {
      const res = PolicyEngine.resolve(allModels, { complexityScore: 1.1 });
      expect(res.policyUsed).toBe('balanced');
      expect(res.selectedModel.id).toBe('local-slm');
    });
  });

  describe('cost_optimized policy', () => {
    it('should select candidate with lowest total token cost', () => {
      // Cloud models only: mockCloudMid ($0.75), mockCloudHigh ($12.5), mockCloudFrontier ($18.0)
      const cloudModels = [mockCloudHigh, mockCloudFrontier, mockCloudMid];
      const res1 = PolicyEngine.resolve(cloudModels, { complexityScore: 4.5 }, 'cost_optimized');
      expect(res1.selectedModel.id).toBe('cloud-gpt4o-mini');
      expect(res1.policyUsed).toBe('cost_optimized');
    });

    it('should select zero-cost model if present among candidates', () => {
      const res = PolicyEngine.resolve(allModels, { complexityScore: 4.0 }, 'cost_optimized');
      expect(res.selectedModel.cost.input_per_mtoken + res.selectedModel.cost.output_per_mtoken).toBe(0);
    });
  });

  describe('local_first policy', () => {
    it('should prefer zero-cost local provider even with high complexity', () => {
      const candidates = [mockLocalSmall, mockCloudMid, mockCloudHigh];
      const res = PolicyEngine.resolve(candidates, { complexityScore: 3.5 }, 'local_first');
      expect(res.selectedModel.id).toBe('local-slm');
      expect(res.policyUsed).toBe('local_first');
    });

    it('should prefer zero-cost local provider over free cloud provider', () => {
      const mockFreeCloud: ModelSpec = {
        id: 'free-cloud-model',
        display_name: 'Free Cloud',
        provider: 'custom',
        upstream_model: 'free-v1',
        base_url: 'https://free.example.com',
        complexity_range: [1.0, 3.0],
        tags: ['cloud', 'free'],
        capabilities: { tools: true, vision: false, max_context: 16384, streaming: true },
        cost: { input_per_mtoken: 0, output_per_mtoken: 0 },
      };

      const candidates = [mockFreeCloud, mockLocalSmall];
      const res = PolicyEngine.resolve(candidates, { complexityScore: 2.0 }, 'local_first');
      expect(res.selectedModel.id).toBe('local-slm');
    });

    it('should fall back to lowest cost model if no local provider is available', () => {
      const cloudOnly = [mockCloudFrontier, mockCloudMid, mockCloudHigh];
      const res = PolicyEngine.resolve(cloudOnly, { complexityScore: 3.0 }, 'local_first');
      expect(res.selectedModel.id).toBe('cloud-gpt4o-mini');
    });
  });

  describe('quality_max policy', () => {
    it('should select model with highest complexity range ceiling', () => {
      // mockLocalSmall (ceiling 2.0), mockCloudMid (ceiling 3.5), mockCloudHigh (ceiling 5.0)
      const candidates = [mockLocalSmall, mockCloudMid, mockCloudHigh];
      const res = PolicyEngine.resolve(candidates, { complexityScore: 1.0 }, 'quality_max');
      expect(res.selectedModel.id).toBe('cloud-gpt4o');
      expect(res.policyUsed).toBe('quality_max');
    });

    it('should pick highest ceiling between local models', () => {
      const candidates = [mockLocalSmall, mockLocalLarge]; // ceiling 2.0 vs 4.0
      const res = PolicyEngine.resolve(candidates, { complexityScore: 1.5 }, 'quality_max');
      expect(res.selectedModel.id).toBe('local-llm');
    });
  });

  describe('empty candidates error handling', () => {
    it('should throw an explicit error when candidate list is empty', () => {
      expect(() => {
        PolicyEngine.resolve([], { complexityScore: 2.5 }, 'balanced');
      }).toThrow('No candidate models available.');

      expect(() => {
        PolicyEngine.resolve([], { complexityScore: 1.0 }, 'cost_optimized');
      }).toThrow('No candidate models available.');
    });
  });

  describe('tie breaking', () => {
    it('should break balanced policy ties by lower total cost', () => {
      // Model A: range [1.0, 3.0], mid 2.0, cost 10
      // Model B: range [1.0, 3.0], mid 2.0, cost 2
      const modelA: ModelSpec = {
        ...mockCloudHigh,
        id: 'model-a-expensive',
        complexity_range: [1.0, 3.0],
        cost: { input_per_mtoken: 4, output_per_mtoken: 6 }, // 10
      };
      const modelB: ModelSpec = {
        ...mockCloudMid,
        id: 'model-b-cheap',
        complexity_range: [1.0, 3.0],
        cost: { input_per_mtoken: 1, output_per_mtoken: 1 }, // 2
      };

      const res = PolicyEngine.resolve([modelA, modelB], { complexityScore: 2.0 }, 'balanced');
      expect(res.selectedModel.id).toBe('model-b-cheap');
    });

    it('should break cost_optimized ties by closer midpoint distance to complexity score', () => {
      // Both models cost 5.0 total
      // Model A mid = 1.0; Model B mid = 3.0
      // Score = 2.8 -> Model B is closer (diff 0.2 vs 1.8)
      const modelA: ModelSpec = {
        ...mockCloudMid,
        id: 'cheap-low-mid',
        complexity_range: [0.0, 2.0], // mid: 1.0
        cost: { input_per_mtoken: 2, output_per_mtoken: 3 }, // 5.0
      };
      const modelB: ModelSpec = {
        ...mockCloudMid,
        id: 'cheap-high-mid',
        complexity_range: [2.0, 4.0], // mid: 3.0
        cost: { input_per_mtoken: 2, output_per_mtoken: 3 }, // 5.0
      };

      const res = PolicyEngine.resolve([modelA, modelB], { complexityScore: 2.8 }, 'cost_optimized');
      expect(res.selectedModel.id).toBe('cheap-high-mid');
    });

    it('should break quality_max ties by higher floor, then lower cost', () => {
      // Same ceiling 5.0
      // Model A: range [1.0, 5.0] (floor 1.0)
      // Model B: range [3.0, 5.0] (floor 3.0) -> higher floor should win
      const modelA: ModelSpec = {
        ...mockCloudHigh,
        id: 'quality-wide',
        complexity_range: [1.0, 5.0],
        cost: { input_per_mtoken: 5, output_per_mtoken: 5 },
      };
      const modelB: ModelSpec = {
        ...mockCloudHigh,
        id: 'quality-specialized',
        complexity_range: [3.0, 5.0],
        cost: { input_per_mtoken: 5, output_per_mtoken: 5 },
      };

      const res1 = PolicyEngine.resolve([modelA, modelB], { complexityScore: 4.0 }, 'quality_max');
      expect(res1.selectedModel.id).toBe('quality-specialized');

      // If ceilings and floors are both equal, break tie by lower cost
      const modelC: ModelSpec = {
        ...modelB,
        id: 'quality-cheaper',
        cost: { input_per_mtoken: 1, output_per_mtoken: 2 }, // 3 vs 10
      };
      const res2 = PolicyEngine.resolve([modelB, modelC], { complexityScore: 4.0 }, 'quality_max');
      expect(res2.selectedModel.id).toBe('quality-cheaper');
    });

    it('should break local_first ties among zero-cost local models by closer midpoint distance', () => {
      // mockLocalSmall (mid 1.0, cost 0) vs mockLocalLarge (mid 3.0, cost 0)
      // Score = 3.2 -> mockLocalLarge is closer (dist 0.2 vs 2.2)
      const res = PolicyEngine.resolve(
        [mockLocalSmall, mockLocalLarge],
        { complexityScore: 3.2 },
        'local_first'
      );
      expect(res.selectedModel.id).toBe('local-llm');
    });
  });

  describe('decision metadata formatting', () => {
    it('should provide complete decision metadata with selectedModel, policyUsed, reason, and complexityScore', () => {
      const evalResult: D1EvaluationResult = {
        complexityScore: 3.4,
        domain: 'coding',
        requiresTools: true,
        requiresVision: false,
        confidence: 0.95,
        isFallback: false,
      };

      const policies: RoutingPolicy[] = ['balanced', 'cost_optimized', 'quality_max', 'local_first'];

      for (const policy of policies) {
        const decision: RoutingDecision = PolicyEngine.resolve(allModels, evalResult, policy);
        expect(decision).toBeDefined();
        expect(decision.selectedModel).toBeDefined();
        expect(decision.selectedModel.id).toBeDefined();
        expect(decision.policyUsed).toBe(policy);
        expect(decision.complexityScore).toBe(3.4);
        expect(typeof decision.reason).toBe('string');
        expect(decision.reason.length).toBeGreaterThan(0);
        expect(decision.reason).toContain(decision.selectedModel.id);
      }
    });
  });
});
