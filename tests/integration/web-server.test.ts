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

  describe('BYOK Decision Provider API (TKT-022)', () => {
    it('GET /api/decision-provider returns current configuration and presets without leaking raw key', async () => {
      const res = await app.request('/api/decision-provider');
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('provider');
      expect(data).toHaveProperty('endpoint');
      expect(data).toHaveProperty('model');
      expect(data).toHaveProperty('timeoutMs');
      expect(data).toHaveProperty('hasApiKey');
      expect(data).toHaveProperty('presets');
      expect(data.presets.ollama).toBeDefined();
      expect(data.presets.liquid).toBeDefined();
      expect(data.presets.custom).toBeDefined();
      expect(data).not.toHaveProperty('apiKey');
    });

    it('PUT /api/decision-provider updates configuration and masks API key', async () => {
      const updatePayload = {
        provider: 'liquid',
        endpoint: 'https://api.liquid.ai/v1/systemone',
        model: 'd1',
        apiKey: 'sk-liq-secret-api-key-9988',
        timeoutMs: 8000,
      };

      const res = await app.request('/api/decision-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.provider).toBe('liquid');
      expect(data.endpoint).toBe('https://api.liquid.ai/v1/systemone');
      expect(data.model).toBe('d1');
      expect(data.timeoutMs).toBe(8000);
      expect(data.hasApiKey).toBe(true);
      expect(data.maskedApiKey).toBe('sk-liq...9988');
      expect(data).not.toHaveProperty('apiKey');

      // Verify subsequent GET reflects changes
      const getRes = await app.request('/api/decision-provider');
      const getData = await getRes.json();
      expect(getData.provider).toBe('liquid');
      expect(getData.hasApiKey).toBe(true);
      expect(getData.maskedApiKey).toBe('sk-liq...9988');
    });

    it('PUT /api/decision-provider rejects invalid provider with 400', async () => {
      const res = await app.request('/api/decision-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'unsupported-provider' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
    });

    it('POST /api/decision-provider/test verifies connectivity and measures latency', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            answers: {
              complexity: { score: 1.0 },
              domain: { choice: 'general' },
            },
          }),
        });

        const res = await app.request('/api/decision-provider/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'liquid',
            endpoint: 'https://api.liquid.ai/v1/systemone',
            model: 'd1',
            apiKey: 'sk-liq-test',
            timeoutMs: 3000,
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
        expect(typeof data.latencyMs).toBe('number');
        expect(data.provider).toBe('liquid');
        expect(data.sampleEvaluation.complexityScore).toBe(1.0);
        expect(data.sampleEvaluation.isFallback).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('POST /api/decision-provider/test returns 400 when target endpoint fails authentication', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        });

        const res = await app.request('/api/decision-provider/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'liquid',
            endpoint: 'https://api.liquid.ai/v1/systemone',
            apiKey: 'invalid-key',
          }),
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.ok).toBe(false);
        expect(data.error).toContain('401');
        expect(data.error).toContain('Unauthorized');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('POST /api/evaluate reflects active provider and supports per-request overrides', async () => {
      // 1. With active liquid provider
      const res = await app.request('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Hello world' }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-d1-provider')).toBe('liquid');
      const data = await res.json();
      expect(data.provider).toBe('liquid');

      // 2. With per-request override
      const overrideRes = await app.request('/api/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Decision-Provider': 'custom',
          'X-Decision-Endpoint': 'http://ephemeral-custom:8000/v1/systemone',
        },
        body: JSON.stringify({ prompt: 'Hello world' }),
      });
      expect(overrideRes.status).toBe(200);
      expect(overrideRes.headers.get('x-d1-provider')).toBe('custom');
      const overrideData = await overrideRes.json();
      expect(overrideData.provider).toBe('custom');

      // 3. Reset back to ollama default
      await app.request('/api/decision-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'ollama' }),
      });
    });
  });

  describe('Web UI Settings & Decision Provider Modal (TKT-023)', () => {
    it('Provides valid presets required by DecisionProviderModal', async () => {
      const res = await app.request('/api/decision-provider');
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.presets).toBeDefined();
      expect(data.presets.ollama.defaultEndpoint).toBe('http://localhost:11434/v1/systemone');
      expect(data.presets.ollama.defaultModel).toBe('d1:latest');
      expect(data.presets.ollama.requiresKey).toBe(false);

      expect(data.presets.liquid.defaultEndpoint).toBe('https://api.liquid.ai/v1/systemone');
      expect(data.presets.liquid.defaultModel).toBe('d1');
      expect(data.presets.liquid.requiresKey).toBe(true);

      expect(data.presets.custom.requiresKey).toBe(false);
    });

    it('Live connection test roundtrip returns latencyMs for UI feedback', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            answers: {
              complexity: { score: 1.0 },
              domain: { choice: 'general' },
            },
          }),
        });

        const testRes = await app.request('/api/decision-provider/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'ollama',
            endpoint: 'http://localhost:11434/v1/systemone',
            model: 'd1:latest',
          }),
        });

        expect(testRes.status).toBe(200);
        const testData = await testRes.json();
        expect(testData.ok).toBe(true);
        expect(typeof testData.latencyMs).toBe('number');
        expect(testData.latencyMs).toBeGreaterThanOrEqual(0);
        expect(testData.provider).toBe('ollama');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Built frontend assets contain DecisionProviderModal and Navbar status pill components', async () => {
      const res = await app.request('/');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('ModelRouter');

      // Check bundled JS asset exists and contains BYOK components
      const fs = await import('fs');
      const path = await import('path');
      const assetsDir = path.resolve(process.cwd(), 'dist/client/assets');
      expect(fs.existsSync(assetsDir)).toBe(true);

      const files = fs.readdirSync(assetsDir);
      const jsBundle = files.find((f: string) => f.endsWith('.js'));
      expect(jsBundle).toBeDefined();

      const bundleContent = fs.readFileSync(path.join(assetsDir, jsBundle!), 'utf-8');
      expect(bundleContent).toContain('Decision Model Provider');
      expect(bundleContent).toContain('BYOK');
      expect(bundleContent).toContain('Configure BYOK Decision Provider');
      expect(bundleContent).toContain('d1:latest');
    });

    it('Built frontend assets contain Hero ASCII animation and Pipeline Flow Graph components (TKT-029)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const assetsDir = path.resolve(process.cwd(), 'dist/client/assets');
      const files = fs.readdirSync(assetsDir);
      const jsBundle = files.find((f: string) => f.endsWith('.js'));
      expect(jsBundle).toBeDefined();

      const bundleContent = fs.readFileSync(path.join(assetsDir, jsBundle!), 'utf-8');
      // Verify Hero ASCII feature (ambient ascii layer flame style like registry)
      expect(bundleContent).toContain('fc-ascii-layer');

      // Verify Graph-based pipeline visualization
      expect(bundleContent).toContain('GRAPH TOPOLOGY');
      expect(bundleContent).toContain('react-flow');
      expect(bundleContent).toContain('Client Ingress');
      expect(bundleContent).toContain('Policy Resolution');
    });

    it('Built frontend assets reflect Zero-Gap Bento Workbench Ingress layout (TKT-031)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const assetsDir = path.resolve(process.cwd(), 'dist/client/assets');
      const files = fs.readdirSync(assetsDir);
      const jsBundle = files.find((f: string) => f.endsWith('.js'));
      expect(jsBundle).toBeDefined();

      const bundleContent = fs.readFileSync(path.join(assetsDir, jsBundle!), 'utf-8');
      expect(bundleContent).toContain('WORKBENCH & INGRESS');
      expect(bundleContent).toContain('Decision Flow Pipeline');
      expect(bundleContent).toContain('Complexity Spectrum');
    });
  });
});
