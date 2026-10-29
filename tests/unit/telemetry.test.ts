import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryStore } from '../../src/core/telemetry';

describe('TelemetryStore', () => {
  let store: TelemetryStore;

  beforeEach(() => {
    store = new TelemetryStore();
  });

  it('should initialize with zero counts and empty lists', () => {
    const stats = store.getStats();
    expect(stats.totalRequests).toBe(0);
    expect(stats.totalTokens).toBe(0);
    expect(stats.avgRoutingLatencyMs).toBe(0);
    expect(stats.totalSavedUsd).toBe(0);
    expect(store.getRecentRequests()).toEqual([]);
  });

  it('should record an event, update running averages and complexity buckets', () => {
    store.recordEvent({
      prompt: 'Hello world',
      score: 1.4,
      domain: 'general',
      selectedModel: {
        id: 'local-chat',
        display_name: 'Local Chat',
        cost: { input_per_mtoken: 0, output_per_mtoken: 0 },
      },
      latencyMs: 12.5,
      policy: 'balanced',
    });

    const stats = store.getStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.avgRoutingLatencyMs).toBe(12.5);
    expect(stats.complexityDistribution['1.0-2.0']).toBe(1);
    expect(stats.domainCounts['general']).toBe(1);
    expect(stats.totalSavedUsd).toBeGreaterThan(0); // Zero cost local saves vs frontier

    const recent = store.getRecentRequests();
    expect(recent.length).toBe(1);
    expect(recent[0].score).toBe(1.4);
    expect(recent[0].modelId).toBe('local-chat');
  });

  it('should cap recent requests at 50 items', () => {
    for (let i = 0; i < 60; i++) {
      store.recordEvent({
        prompt: `Prompt ${i}`,
        score: 2.5,
        domain: 'coding',
        selectedModel: {
          id: 'test-model',
          cost: { input_per_mtoken: 1, output_per_mtoken: 2 },
        },
        latencyMs: 10,
        policy: 'cost_optimized',
      });
    }

    const recent = store.getRecentRequests();
    expect(recent.length).toBe(50);
    expect(recent[0].promptSnippet).toContain('Prompt 59');
  });
});
