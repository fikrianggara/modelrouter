import { describe, it, expect } from 'vitest';
import { app } from '../../src/api/server';

describe('Web Dashboard & API Integration Tests (TKT-009)', { timeout: 15000 }, () => {
  it('GET /api/registry returns all registered models with capabilities and tags', async () => {
    const res = await app.request('/api/registry');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty('models');
    expect(Array.isArray(data.models)).toBe(true);
    expect(data.models.length).toBeGreaterThanOrEqual(3);

    const localChat = data.models.find((m: any) => m.id === 'local-chat');
    expect(localChat).toBeDefined();
    expect(localChat.provider).toBe('ollama');
    expect(localChat.complexity_range).toEqual([0.0, 1.8]);
    expect(localChat.tags).toContain('local');

    const cloudCoder = data.models.find((m: any) => m.id === 'cloud-coder');
    expect(cloudCoder).toBeDefined();
    expect(cloudCoder.provider).toBe('anthropic');
    expect(cloudCoder.capabilities.tools).toBe(true);
  });

  it('POST /api/evaluate evaluates prompt complexity and returns routing decision', async () => {
    const res = await app.request('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Hi, what is the capital of France?',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.complexityScore).toBe('number');
    expect(data.complexityScore).toBeGreaterThanOrEqual(1.0);
    expect(data.complexityScore).toBeLessThanOrEqual(5.0);
    expect(data.selectedModel).toBeDefined();
    expect(typeof data.routingLatencyMs).toBe('number');
  });

  it('POST /api/evaluate correctly identifies higher complexity code prompts', async () => {
    const res = await app.request('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Refactor this distributed Raft consensus implementation in Rust with async channels, election timers, and formal invariant checks.',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.complexityScore).toBeGreaterThan(2.0);
    expect(data.selectedModel).toBeDefined();
  });

  it('GET /api/stats returns runtime status and telemetry summary', async () => {
    const res = await app.request('/api/stats');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('online');
    expect(data.targetLatencyMs).toBe(30);
    expect(typeof data.registeredModels).toBe('number');
    expect(data.registeredModels).toBeGreaterThanOrEqual(3);
  });

  it('supports model CRUD and enable/disable toggle API', async () => {
    // 1. Add model
    const newModelPayload = {
      id: 'test-crud-model',
      display_name: 'Test CRUD Model',
      provider: 'custom',
      upstream_model: 'crud-v1',
      base_url: 'http://localhost:9000/v1',
      complexity_range: [1.0, 3.0],
      tags: ['test', 'crud'],
      capabilities: { tools: true, vision: false, max_context: 4096, streaming: true },
      cost: { input_per_mtoken: 0.1, output_per_mtoken: 0.2 },
      enabled: true,
    };

    const addRes = await app.request('/api/registry/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newModelPayload),
    });
    expect(addRes.status).toBe(200);
    const addData = await addRes.json();
    expect(addData.ok).toBe(true);
    expect(addData.model.id).toBe('test-crud-model');

    // 2. Update model
    const updateRes = await app.request('/api/registry/model/test-crud-model', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'Updated CRUD Model' }),
    });
    expect(updateRes.status).toBe(200);
    const updateData = await updateRes.json();
    expect(updateData.model.display_name).toBe('Updated CRUD Model');

    // 3. Toggle model
    const toggleRes = await app.request('/api/registry/model/test-crud-model/toggle', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(toggleRes.status).toBe(200);
    const toggleData = await toggleRes.json();
    expect(toggleData.model.enabled).toBe(false);

    // 4. Delete model
    const deleteRes = await app.request('/api/registry/model/test-crud-model', {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);
    const deleteData = await deleteRes.json();
    expect(deleteData.ok).toBe(true);
  });

  it('GET /api/telemetry/recent returns recent requests list', async () => {
    const res = await app.request('/api/telemetry/recent');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('requests');
    expect(Array.isArray(data.requests)).toBe(true);
  });

  it('Serves SPA static index.html on root and subroutes', async () => {
    const resRoot = await app.request('/');
    expect(resRoot.status).toBe(200);
    const textRoot = await resRoot.text();
    expect(textRoot).toContain('ModelRouter');

    const resPlayground = await app.request('/playground');
    expect(resPlayground.status).toBe(200);
    const textPlayground = await resPlayground.text();
    expect(textPlayground).toContain('ModelRouter');

    const resRegistry = await app.request('/registry');
    expect(resRegistry.status).toBe(200);
    const textRegistry = await resRegistry.text();
    expect(textRegistry).toContain('ModelRouter');
  });
});
