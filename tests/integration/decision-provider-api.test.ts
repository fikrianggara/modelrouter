import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createApp } from '../../src/api/server';
import { loadConfig } from '../../src/core/config';
import { D1Client } from '../../src/engine/d1-client';
import { ModelRegistry } from '../../src/engine/registry';

describe('Decision Provider Security API Integration Tests (TKT-027 / VULN-10, VULN-11)', () => {
  it('protects PUT and POST test endpoints with ADMIN_API_KEY auth guard', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-test-fixtures-'));
    const testDecisionConfigPath = path.join(tmpDir, 'test-decision-provider.json');

    const configWithAdmin = loadConfig({
      ADMIN_API_KEY: 'secret-admin-token-12345',
      REGISTRY_PATH: 'config/registry.yaml',
    });

    const app = createApp({
      config: configWithAdmin,
      decisionConfigPath: testDecisionConfigPath,
    });

    // 1. PUT /api/decision-provider without auth -> 401
    const unauthPut = await app.request('/api/decision-provider', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'ollama' }),
    });
    expect(unauthPut.status).toBe(401);
    const unauthPutBody = await unauthPut.json();
    expect(unauthPutBody.error).toMatch(/Unauthorized/i);

    // 2. PUT /api/decision-provider with wrong token -> 401
    const wrongPut = await app.request('/api/decision-provider', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-token',
      },
      body: JSON.stringify({ provider: 'ollama' }),
    });
    expect(wrongPut.status).toBe(401);

    // 3. PUT /api/decision-provider with valid token -> 200
    const authPut = await app.request('/api/decision-provider', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-admin-token-12345',
      },
      body: JSON.stringify({ provider: 'ollama' }),
    });
    expect(authPut.status).toBe(200);

    // 4. POST /api/decision-provider/test without auth -> 401
    const unauthTest = await app.request('/api/decision-provider/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'ollama' }),
    });
    expect(unauthTest.status).toBe(401);

    // 5. POST /api/decision-provider/test with valid token -> not 401
    const authTest = await app.request('/api/decision-provider/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-admin-token-12345',
      },
      body: JSON.stringify({
        provider: 'ollama',
        endpoint: 'http://localhost:11434/v1/systemone',
        timeoutMs: 150,
      }),
    });
    expect(authTest.status).not.toBe(401);
  });

  it('does not leak server host API key to custom endpoint in POST /api/decision-provider/test', async () => {
    // Setup server with host D1 key
    const hostKey = 'host-super-secret-key-123';
    let interceptedAuthHeader: string | null = null;

    // Spy global fetch to inspect headers sent to custom endpoint
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
      interceptedAuthHeader = init?.headers?.Authorization || init?.headers?.authorization || null;
      return new Response(JSON.stringify({ complexity: 0.5 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const mockD1Client = new D1Client({
      provider: 'liquid',
      endpoint: 'https://api.liquid.ai/v1',
      model: 'liquid-d1',
      apiKey: hostKey,
    });

    const app = createApp({
      d1Client: mockD1Client,
      decisionConfigPath: path.join(os.tmpdir(), `test-byok-${Date.now()}.json`),
    });

    // Send test request to custom third-party endpoint WITHOUT apiKey
    const res = await app.request('/api/decision-provider/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'custom',
        endpoint: 'https://attacker-controlled-server.com/api',
      }),
    });

    fetchSpy.mockRestore();

    // Verify host key was NOT sent
    expect(interceptedAuthHeader).toBeNull();
  });

  it('does not leak server host API key when x-decision-endpoint header override is used', async () => {
    const hostKey = 'host-super-secret-key-999';
    let interceptedAuthHeader: string | null = null;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
      interceptedAuthHeader = init?.headers?.Authorization || init?.headers?.authorization || null;
      return new Response(JSON.stringify({ complexity: 0.5 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const mockD1Client = new D1Client({
      provider: 'liquid',
      endpoint: 'https://api.liquid.ai/v1',
      model: 'liquid-d1',
      apiKey: hostKey,
    });

    const app = createApp({
      d1Client: mockD1Client,
      decisionConfigPath: path.join(os.tmpdir(), `test-byok-${Date.now()}.json`),
    });

    // Call evaluate with x-decision-endpoint header override without key
    await app.request('/api/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-decision-endpoint': 'https://attacker.com/v1',
      },
      body: JSON.stringify({ prompt: 'test prompt' }),
    });

    fetchSpy.mockRestore();

    // Verify host key was NOT sent
    expect(interceptedAuthHeader).toBeNull();
  });
});
