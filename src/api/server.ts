import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'fs';
import path from 'path';
import { config, AppConfig } from '../core/config';
import { ModelRegistry, ModelSpec } from '../engine/registry';
import { D1Client, D1EvaluationResult } from '../engine/d1-client';
import { PolicyEngine, RoutingPolicy } from '../engine/policy-engine';
import { CanonicalRequest, CanonicalMessage } from '../core/types';
import {
  createOpenAIToAnthropicTransform,
  createAnthropicToOpenAITransform,
} from '../adapters/sse-transcoder';
import { telemetry } from '../core/telemetry';

export interface ServerOptions {
  registry?: ModelRegistry;
  d1Client?: D1Client;
  config?: AppConfig;
}

export function loadRegistry(registryPath: string): ModelRegistry {
  const resolved = path.isAbsolute(registryPath)
    ? registryPath
    : path.resolve(process.cwd(), registryPath);

  if (fs.existsSync(resolved)) {
    return ModelRegistry.fromFile(resolved);
  }
  return new ModelRegistry([]);
}

function parsePolicy(
  modelName?: string,
  explicitPolicy?: string,
  defaultPolicy: RoutingPolicy = 'balanced'
): RoutingPolicy {
  if (modelName === 'd1-router-cost') return 'cost_optimized';
  if (modelName === 'd1-router-quality') return 'quality_max';
  if (modelName === 'd1-router-local') return 'local_first';
  if (modelName === 'd1-router-auto') return 'balanced';
  if (
    explicitPolicy &&
    ['balanced', 'cost_optimized', 'quality_max', 'local_first'].includes(
      explicitPolicy
    )
  ) {
    return explicitPolicy as RoutingPolicy;
  }
  return defaultPolicy;
}

function getUpstreamAuthHeaders(
  model: ModelSpec,
  incomingHeaders: Headers
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (model.provider === 'anthropic') {
    const apiKey =
      (model.api_key_env ? process.env[model.api_key_env] : undefined) ||
      incomingHeaders.get('x-api-key') ||
      '';
    if (apiKey) headers['x-api-key'] = apiKey;
    headers['anthropic-version'] =
      incomingHeaders.get('anthropic-version') || '2023-06-01';
  } else {
    const apiKey = model.api_key_env
      ? process.env[model.api_key_env]
      : undefined;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (incomingHeaders.get('authorization')) {
      headers['Authorization'] = incomingHeaders.get('authorization')!;
    }
  }

  return headers;
}

export function createApp(options?: ServerOptions): Hono {
  const appConfig = options?.config || config;
  const registry =
    options?.registry || loadRegistry(appConfig.REGISTRY_PATH);
  const d1Client =
    options?.d1Client ||
    new D1Client(
      appConfig.D1_ENDPOINT,
      appConfig.D1_MODEL,
      appConfig.D1_TIMEOUT_MS
    );

  const app = new Hono();

  app.use('*', cors());

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // 1. GET /v1/models - Return virtual and registered models
  app.get('/v1/models', (c) => {
    const virtualModels = [
      { id: 'd1-router-auto', object: 'model', owned_by: 'system-one' },
      { id: 'd1-router-cost', object: 'model', owned_by: 'system-one' },
      { id: 'd1-router-quality', object: 'model', owned_by: 'system-one' },
      { id: 'd1-router-local', object: 'model', owned_by: 'system-one' },
    ];

    const registeredModels = registry.getAllModels().map((m) => ({
      id: m.id,
      object: 'model',
      owned_by: m.provider,
    }));

    return c.json({
      object: 'list',
      data: [...virtualModels, ...registeredModels],
    });
  });

  // Helper for model routing and evaluation
  async function routeRequest(
    canonical: CanonicalRequest,
    requestedModel?: string,
    explicitPolicy?: string
  ): Promise<{
    evalResult: D1EvaluationResult;
    selectedModel: ModelSpec;
    latencyMs: string;
  }> {
    const t0 = performance.now();
    const state = CanonicalRequest.extractState(canonical);

    let evalResult: D1EvaluationResult;
    try {
      evalResult = await d1Client.evaluate(state);
    } catch (err: any) {
      evalResult = D1Client.fallbackEvaluate(state, err?.message);
    }

    const policy = parsePolicy(
      requestedModel,
      explicitPolicy,
      appConfig.DEFAULT_POLICY
    );

    const directModel =
      requestedModel && !requestedModel.startsWith('d1-router-')
        ? registry.getModel(requestedModel)
        : undefined;

    let selectedModel: ModelSpec;
    let candidatesCount = 0;
    let poolSize = 0;
    if (directModel) {
      selectedModel = directModel;
      candidatesCount = 1;
      poolSize = 1;
    } else {
      const candidates = registry.findCandidates({
        complexity: evalResult.complexityScore,
        requiresTools: evalResult.requiresTools,
        requiresVision: evalResult.requiresVision,
      });
      candidatesCount = candidates.length;

      const pool =
        candidates.length > 0 ? candidates : registry.getAllModels(false);
      poolSize = pool.length;
      if (pool.length === 0) {
        throw new Error('No active models available in registry');
      }

      const decision = PolicyEngine.resolve(pool, evalResult, policy);
      selectedModel = decision.selectedModel;
    }

    const latencyMs = (performance.now() - t0).toFixed(2);
    return { evalResult, selectedModel, latencyMs, policy, candidatesCount, poolSize };
  }

  // Web Dashboard & Playground API routes
  app.get('/api/registry', (c) => {
    return c.json({
      models: registry.getAllModels(true),
    });
  });

  app.post('/api/registry/model', async (c) => {
    try {
      const body = await c.req.json();
      registry.addModel(body);
      try {
        registry.saveToFile(appConfig.REGISTRY_PATH);
      } catch (err: any) {
        console.warn('Could not persist registry to file:', err.message);
      }
      return c.json({ ok: true, model: registry.getModel(body.id) });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || 'Failed to add model' }, 400);
    }
  });

  app.put('/api/registry/model/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json();
      const updated = registry.updateModel(id, body);
      try {
        registry.saveToFile(appConfig.REGISTRY_PATH);
      } catch (err: any) {
        console.warn('Could not persist registry to file:', err.message);
      }
      return c.json({ ok: true, model: updated });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || 'Failed to update model' }, 400);
    }
  });

  app.delete('/api/registry/model/:id', (c) => {
    try {
      const id = c.req.param('id');
      const deleted = registry.deleteModel(id);
      if (deleted) {
        try {
          registry.saveToFile(appConfig.REGISTRY_PATH);
        } catch (err: any) {
          console.warn('Could not persist registry to file:', err.message);
        }
        return c.json({ ok: true });
      }
      return c.json({ ok: false, error: `Model "${id}" not found` }, 404);
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || 'Failed to delete model' }, 400);
    }
  });

  app.patch('/api/registry/model/:id/toggle', async (c) => {
    try {
      const id = c.req.param('id');
      let body: any = {};
      try {
        body = await c.req.json();
      } catch {}
      const updated = registry.toggleModel(id, body.enabled);
      try {
        registry.saveToFile(appConfig.REGISTRY_PATH);
      } catch (err: any) {
        console.warn('Could not persist registry to file:', err.message);
      }
      return c.json({ ok: true, model: updated });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || 'Failed to toggle model' }, 400);
    }
  });

  app.post('/api/evaluate', async (c) => {
    let body: any = {};
    try {
      body = await c.req.json();
    } catch {
      // ignore empty body
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const requestedModel = body.model || 'd1-router-auto';
    const explicitPolicy = body.policy;
    const canonical: CanonicalRequest = {
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    };
    try {
      const result = await routeRequest(canonical, requestedModel, explicitPolicy);

      // Record to telemetry
      telemetry.recordEvent({
        prompt,
        score: result.evalResult.complexityScore,
        domain: result.evalResult.domain,
        selectedModel: result.selectedModel,
        latencyMs: parseFloat(result.latencyMs),
        policy: result.policy,
        isFallback: result.evalResult.isFallback,
      });

      return c.json({
        ok: true,
        complexityScore: result.evalResult.complexityScore,
        confidence: result.evalResult.confidence,
        domain: result.evalResult.domain,
        requiresTools: result.evalResult.requiresTools,
        requiresVision: result.evalResult.requiresVision,
        isFallback: Boolean(result.evalResult.isFallback),
        fallbackReason: result.evalResult.fallbackReason,
        selectedModel: result.selectedModel,
        routingLatencyMs: parseFloat(result.latencyMs),
        policy: result.policy,
        candidatesCount: result.candidatesCount,
        poolSize: result.poolSize,
      });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || 'Evaluation failed' }, 500);
    }
  });

  app.get('/api/stats', (c) => {
    const stats = telemetry.getStats();
    const allModels = registry.getAllModels(true);
    const activeModels = registry.getAllModels(false);
    return c.json({
      ...stats,
      registeredModels: allModels.length,
      activeModels: activeModels.length,
      disabledModels: allModels.length - activeModels.length,
      defaultPolicy: appConfig.DEFAULT_POLICY,
      targetLatencyMs: 30,
      d1Endpoint: appConfig.D1_ENDPOINT,
    });
  });

  app.get('/api/telemetry/recent', (c) => {
    return c.json({
      requests: telemetry.getRecentRequests(),
    });
  });

  app.post('/api/telemetry/reset', (c) => {
    telemetry.reset();
    return c.json({ ok: true });
  });

  // 2. POST /v1/chat/completions - OpenAI API format
  app.post('/v1/chat/completions', async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: {
            message: 'Invalid JSON payload',
            type: 'invalid_request_error',
          },
        },
        400
      );
    }

    const canonicalMessages: CanonicalMessage[] = (body.messages || []).map(
      (m: any) => ({
        role: m.role,
        content:
          typeof m.content === 'string'
            ? m.content
            : Array.isArray(m.content)
            ? m.content.map((part: any) => part.text || '').join('')
            : JSON.stringify(m.content ?? ''),
        name: m.name,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
      })
    );

    const canonical: CanonicalRequest = {
      messages: canonicalMessages,
      stream: Boolean(body.stream),
      tools: body.tools,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
    };

    const { evalResult, selectedModel, latencyMs, policy } = await routeRequest(
      canonical,
      body.model,
      body.policy
    );

    c.header('X-D1-Complexity-Score', evalResult.complexityScore.toFixed(2));
    c.header('X-D1-Domain', evalResult.domain);
    c.header('X-D1-Selected-Model', selectedModel.id);
    c.header('X-D1-Routing-Latency-Ms', latencyMs);
    if (evalResult.isFallback) {
      c.header('X-D1-Fallback', 'true');
      if (evalResult.fallbackReason) {
        c.header('X-D1-Fallback-Reason', evalResult.fallbackReason);
      }
    }

    // Record telemetry event
    telemetry.recordEvent({
      prompt: canonicalMessages.map((m) => m.content).join(' '),
      score: evalResult.complexityScore,
      domain: evalResult.domain,
      selectedModel,
      latencyMs: parseFloat(latencyMs),
      policy,
      isFallback: evalResult.isFallback,
    });

    const telemetryHeaders: Record<string, string> = {
      'X-D1-Complexity-Score': evalResult.complexityScore.toFixed(2),
      'X-D1-Domain': evalResult.domain,
      'X-D1-Selected-Model': selectedModel.id,
      'X-D1-Routing-Latency-Ms': latencyMs,
    };
    if (evalResult.isFallback) {
      telemetryHeaders['X-D1-Fallback'] = 'true';
      if (evalResult.fallbackReason) {
        telemetryHeaders['X-D1-Fallback-Reason'] = evalResult.fallbackReason;
      }
    }

    // Route to Anthropic upstream if model provider is Anthropic
    if (selectedModel.provider === 'anthropic') {
      const upstreamUrl = `${selectedModel.base_url.replace(/\/$/, '')}/messages`;
      const systemMsgs = canonicalMessages.filter((m) => m.role === 'system');
      const dialogMsgs = canonicalMessages.filter((m) => m.role !== 'system');
      const system = systemMsgs.map((m) => m.content).join('\n');

      const upstreamBody = {
        model: selectedModel.upstream_model,
        messages: dialogMsgs.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        system: system || undefined,
        max_tokens: body.max_tokens || 4096,
        stream: Boolean(body.stream),
        temperature: body.temperature,
      };

      const upstreamHeaders = {
        'Content-Type': 'application/json',
        ...getUpstreamAuthHeaders(selectedModel, c.req.raw.headers),
      };

      const upstreamRes = await fetch(upstreamUrl, {
        method: 'POST',
        headers: upstreamHeaders,
        body: JSON.stringify(upstreamBody),
        signal: c.req.raw.signal,
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text();
        try {
          return c.json(JSON.parse(errText), upstreamRes.status as any);
        } catch {
          return c.text(errText, upstreamRes.status as any);
        }
      }

      if (body.stream && upstreamRes.body) {
        const transformedStream = upstreamRes.body
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(
            createAnthropicToOpenAITransform(selectedModel.upstream_model)
          )
          .pipeThrough(new TextEncoderStream());

        return new Response(transformedStream, {
          status: upstreamRes.status,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            ...telemetryHeaders,
          },
        });
      }

      const anthropicData: any = await upstreamRes.json();
      const openAiRes = {
        id: anthropicData.id
          ? anthropicData.id.replace(/^msg_/, 'chatcmpl-')
          : `chatcmpl-${Math.random().toString(36).slice(2)}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: selectedModel.upstream_model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: Array.isArray(anthropicData.content)
                ? anthropicData.content.map((p: any) => p.text || '').join('')
                : '',
            },
            finish_reason:
              anthropicData.stop_reason === 'end_turn'
                ? 'stop'
                : anthropicData.stop_reason === 'max_tokens'
                ? 'length'
                : 'stop',
          },
        ],
        usage: {
          prompt_tokens: anthropicData.usage?.input_tokens ?? 0,
          completion_tokens: anthropicData.usage?.output_tokens ?? 0,
          total_tokens:
            (anthropicData.usage?.input_tokens ?? 0) +
            (anthropicData.usage?.output_tokens ?? 0),
        },
      };

      return c.json(openAiRes, upstreamRes.status as any);
    }

    // Default: OpenAI or Ollama upstream
    const upstreamUrl = `${selectedModel.base_url.replace(/\/$/, '')}/chat/completions`;
    const upstreamBody = {
      ...body,
      model: selectedModel.upstream_model,
    };

    const upstreamHeaders = {
      'Content-Type': 'application/json',
      ...getUpstreamAuthHeaders(selectedModel, c.req.raw.headers),
    };

    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(upstreamBody),
      signal: c.req.raw.signal,
    });

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      try {
        return c.json(JSON.parse(errText), upstreamRes.status as any);
      } catch {
        return c.text(errText, upstreamRes.status as any);
      }
    }

    if (body.stream && upstreamRes.body) {
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...telemetryHeaders,
        },
      });
    }

    const data = await upstreamRes.json();
    return c.json(data, upstreamRes.status as any);
  });

  // 3. POST /v1/messages - Anthropic Messages API format
  app.post('/v1/messages', async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'Invalid JSON payload',
          },
        },
        400
      );
    }

    let systemText: string | undefined;
    if (typeof body.system === 'string') {
      systemText = body.system;
    } else if (Array.isArray(body.system)) {
      systemText = body.system.map((s: any) => s.text || '').join('\n');
    }

    const canonicalMessages: CanonicalMessage[] = (body.messages || []).map(
      (m: any) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.map((part: any) => part.text || '').join('')
          : typeof m.content === 'string'
          ? m.content
          : JSON.stringify(m.content ?? ''),
      })
    );

    const canonical: CanonicalRequest = {
      messages: canonicalMessages,
      system: systemText,
      stream: Boolean(body.stream),
      tools: body.tools,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
    };

    const { evalResult, selectedModel, latencyMs, policy } = await routeRequest(
      canonical,
      body.model,
      body.policy
    );

    c.header('X-D1-Complexity-Score', evalResult.complexityScore.toFixed(2));
    c.header('X-D1-Domain', evalResult.domain);
    c.header('X-D1-Selected-Model', selectedModel.id);
    c.header('X-D1-Routing-Latency-Ms', latencyMs);
    if (evalResult.isFallback) {
      c.header('X-D1-Fallback', 'true');
      if (evalResult.fallbackReason) {
        c.header('X-D1-Fallback-Reason', evalResult.fallbackReason);
      }
    }

    // Record telemetry event
    telemetry.recordEvent({
      prompt: canonicalMessages.map((m) => m.content).join(' '),
      score: evalResult.complexityScore,
      domain: evalResult.domain,
      selectedModel,
      latencyMs: parseFloat(latencyMs),
      policy,
      isFallback: evalResult.isFallback,
    });

    const telemetryHeaders: Record<string, string> = {
      'X-D1-Complexity-Score': evalResult.complexityScore.toFixed(2),
      'X-D1-Domain': evalResult.domain,
      'X-D1-Selected-Model': selectedModel.id,
      'X-D1-Routing-Latency-Ms': latencyMs,
    };
    if (evalResult.isFallback) {
      telemetryHeaders['X-D1-Fallback'] = 'true';
      if (evalResult.fallbackReason) {
        telemetryHeaders['X-D1-Fallback-Reason'] = evalResult.fallbackReason;
      }
    }

    // If upstream is Anthropic, forward directly
    if (selectedModel.provider === 'anthropic') {
      const upstreamUrl = `${selectedModel.base_url.replace(/\/$/, '')}/messages`;
      const upstreamBody = {
        ...body,
        model: selectedModel.upstream_model,
      };

      const upstreamHeaders = {
        'Content-Type': 'application/json',
        ...getUpstreamAuthHeaders(selectedModel, c.req.raw.headers),
      };

      const upstreamRes = await fetch(upstreamUrl, {
        method: 'POST',
        headers: upstreamHeaders,
        body: JSON.stringify(upstreamBody),
        signal: c.req.raw.signal,
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text();
        try {
          return c.json(JSON.parse(errText), upstreamRes.status as any);
        } catch {
          return c.text(errText, upstreamRes.status as any);
        }
      }

      if (body.stream && upstreamRes.body) {
        return new Response(upstreamRes.body, {
          status: upstreamRes.status,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            ...telemetryHeaders,
          },
        });
      }

      const data = await upstreamRes.json();
      return c.json(data, upstreamRes.status as any);
    }

    // Upstream is OpenAI / Ollama: translate Anthropic to OpenAI
    const upstreamUrl = `${selectedModel.base_url.replace(/\/$/, '')}/chat/completions`;
    const openAiMessages: Array<{ role: string; content: string }> = [];
    if (systemText) {
      openAiMessages.push({ role: 'system', content: systemText });
    }
    for (const m of canonicalMessages) {
      openAiMessages.push({ role: m.role, content: m.content });
    }

    const upstreamBody = {
      model: selectedModel.upstream_model,
      messages: openAiMessages,
      stream: Boolean(body.stream),
      max_tokens: body.max_tokens,
      temperature: body.temperature,
    };

    const upstreamHeaders = {
      'Content-Type': 'application/json',
      ...getUpstreamAuthHeaders(selectedModel, c.req.raw.headers),
    };

    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(upstreamBody),
      signal: c.req.raw.signal,
    });

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      try {
        return c.json(JSON.parse(errText), upstreamRes.status as any);
      } catch {
        return c.text(errText, upstreamRes.status as any);
      }
    }

    // If streaming: Transcode OpenAI SSE chunks to Anthropic SSE events
    if (body.stream && upstreamRes.body) {
      const transformedStream = upstreamRes.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(
          createOpenAIToAnthropicTransform(selectedModel.upstream_model)
        )
        .pipeThrough(new TextEncoderStream());

      return new Response(transformedStream, {
        status: upstreamRes.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...telemetryHeaders,
        },
      });
    }

    // Non-streaming: convert OpenAI response to Anthropic response
    const data: any = await upstreamRes.json();
    const anthropicRes = {
      id: data.id
        ? data.id.replace(/^chatcmpl-/, 'msg_')
        : `msg_${Math.random().toString(36).slice(2)}`,
      type: 'message',
      role: 'assistant',
      model: selectedModel.upstream_model,
      content: [
        {
          type: 'text',
          text: data.choices?.[0]?.message?.content || '',
        },
      ],
      stop_reason:
        data.choices?.[0]?.finish_reason === 'stop'
          ? 'end_turn'
          : data.choices?.[0]?.finish_reason === 'length'
          ? 'max_tokens'
          : 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0,
      },
    };

    return c.json(anthropicRes, upstreamRes.status as any);
  });

  // 4. Static client serving (dist/client)
  const clientDist = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(clientDist)) {
    app.use('/*', async (c, next) => {
      // Do not intercept API or health endpoints
      if (
        c.req.path.startsWith('/v1/') ||
        c.req.path.startsWith('/api/') ||
        c.req.path === '/health'
      ) {
        return next();
      }
      return serveStatic({ root: './dist/client' })(c, next);
    });

    app.get('*', (c, next) => {
      if (
        c.req.path.startsWith('/v1/') ||
        c.req.path.startsWith('/api/') ||
        c.req.path === '/health'
      ) {
        return next();
      }
      return serveStatic({ path: './dist/client/index.html' })(c, next);
    });
  }

  return app;
}

export const app = createApp();

if (
  process.env.NODE_ENV !== 'test' &&
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'))
) {
  serve(
    {
      fetch: app.fetch,
      port: config.PORT,
      hostname: config.HOST,
    },
    (info) => {
      console.log(`Model Router Server running at http://${info.address}:${info.port}`);
    }
  );
}
