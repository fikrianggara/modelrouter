import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { app } from '../../src/api/server';

describe('Hono Gateway Integration Tests (TKT-008)', () => {
  const originalFetch = globalThis.fetch;
  let mockD1Complexity = 1.2;
  let mockD1Domain = 'general';
  let capturedUpstreamRequests: Array<{ url: string; method: string; headers: any; body: any }> = [];

  beforeEach(() => {
    mockD1Complexity = 1.2;
    mockD1Domain = 'general';
    capturedUpstreamRequests = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';
      const bodyStr = init?.body ? String(init.body) : undefined;
      let parsedBody: any;
      try {
        if (bodyStr) parsedBody = JSON.parse(bodyStr);
      } catch {
        parsedBody = bodyStr;
      }

      capturedUpstreamRequests.push({
        url,
        method,
        headers: init?.headers,
        body: parsedBody,
      });

      // 1. Mock D1 System One endpoint
      if (url.includes('/v1/systemone')) {
        return new Response(
          JSON.stringify({
            answers: {
              complexity: {
                score: mockD1Complexity,
                confidence: 0.95,
              },
              domain: {
                choice: mockD1Domain,
                confidence: 0.9,
              },
              requires_tools: {
                probability: 0.05,
              },
              requires_vision: {
                probability: 0.05,
              },
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // 2. Mock OpenAI chat completions upstream
      if (url.includes('/chat/completions')) {
        const isStreaming = parsedBody?.stream === true;
        if (isStreaming) {
          const sseContent = [
            'data: {"id":"chatcmpl-mock1","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
            'data: {"id":"chatcmpl-mock1","choices":[{"index":0,"delta":{"content":"Hello from "},"finish_reason":null}]}\n\n',
            'data: {"id":"chatcmpl-mock1","choices":[{"index":0,"delta":{"content":"mock OpenAI!"},"finish_reason":null}]}\n\n',
            'data: {"id":"chatcmpl-mock1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
            'data: [DONE]\n\n',
          ].join('');

          return new Response(sseContent, {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
          });
        }

        return new Response(
          JSON.stringify({
            id: 'chatcmpl-mock123',
            object: 'chat.completion',
            created: 1730160000,
            model: parsedBody?.model || 'mock-upstream-model',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Hello! This is a non-streaming response from mock OpenAI upstream.',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 15,
              completion_tokens: 12,
              total_tokens: 27,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // 3. Mock Anthropic messages upstream
      if (url.includes('/messages')) {
        const isStreaming = parsedBody?.stream === true;
        if (isStreaming) {
          const sseContent = [
            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_mock1","type":"message","role":"assistant","model":"claude-3-5-sonnet-20241022","content":[],"stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello from "}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"mock Anthropic!"}}\n\n',
            'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":8}}\n\n',
            'event: message_stop\ndata: {"type":"message_stop"}\n\n',
          ].join('');

          return new Response(sseContent, {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
          });
        }

        return new Response(
          JSON.stringify({
            id: 'msg_mock123',
            type: 'message',
            role: 'assistant',
            model: parsedBody?.model || 'claude-3-5-sonnet-20241022',
            content: [
              {
                type: 'text',
                text: 'Hello from mock Anthropic messages upstream.',
              },
            ],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
              input_tokens: 20,
              output_tokens: 10,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response('Not found', { status: 404 });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('GET /v1/models', () => {
    it('returns list of virtual router models and registered models', async () => {
      const res = await app.request('/v1/models');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.object).toBe('list');
      expect(Array.isArray(json.data)).toBe(true);

      const ids = json.data.map((m: any) => m.id);

      // Virtual router models
      expect(ids).toContain('d1-router-auto');
      expect(ids).toContain('d1-router-cost');
      expect(ids).toContain('d1-router-quality');
      expect(ids).toContain('d1-router-local');

      // Registered models from config/registry.yaml
      expect(ids).toContain('local-chat');
      expect(ids).toContain('cloud-coder');
      expect(ids).toContain('openai-gpt4o');

      // Verify structure of virtual model
      const autoModel = json.data.find((m: any) => m.id === 'd1-router-auto');
      expect(autoModel).toEqual({
        id: 'd1-router-auto',
        object: 'model',
        owned_by: 'system-one',
      });
    });
  });

  describe('POST /v1/chat/completions', () => {
    it('routes non-streaming requests to evaluated model with telemetry headers', async () => {
      mockD1Complexity = 1.2; // Low complexity -> matches local-chat (0.0 - 1.8)

      const payload = {
        model: 'd1-router-auto',
        messages: [{ role: 'user', content: 'What is 2 + 2?' }],
        stream: false,
      };

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);

      // Verify telemetry headers
      expect(res.headers.get('x-d1-complexity-score')).toBe('1.20');
      expect(res.headers.get('x-d1-domain')).toBe('general');
      expect(res.headers.get('x-d1-selected-model')).toBe('local-chat');
      const latency = Number(res.headers.get('x-d1-routing-latency-ms'));
      expect(latency).toBeGreaterThanOrEqual(0);

      // Verify response body
      const json = await res.json();
      expect(json.object).toBe('chat.completion');
      expect(json.choices[0].message.content).toContain('non-streaming response');

      // Verify upstream call was forwarded to local-chat base_url
      const upstreamCall = capturedUpstreamRequests.find(
        (r) => r.url.includes('/chat/completions')
      );
      expect(upstreamCall).toBeDefined();
      expect(upstreamCall?.url).toContain('http://localhost:11434/v1/chat/completions');
      expect(upstreamCall?.body.model).toBe('lfm3:latest');
    });

    it('routes streaming requests with telemetry headers and SSE stream', async () => {
      mockD1Complexity = 1.0;

      const payload = {
        model: 'd1-router-auto',
        messages: [{ role: 'user', content: 'Say hello!' }],
        stream: true,
      };

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('x-d1-complexity-score')).toBe('1.00');
      expect(res.headers.get('x-d1-selected-model')).toBe('local-chat');
      expect(res.headers.get('x-d1-routing-latency-ms')).toBeDefined();

      const text = await res.text();
      expect(text).toContain('data: {"id":"chatcmpl-mock1"');
      expect(text).toContain('Hello from ');
      expect(text).toContain('data: [DONE]');
    });
  });

  describe('POST /v1/messages', () => {
    it('routes non-streaming Anthropic request and formats response with telemetry headers', async () => {
      mockD1Complexity = 1.2; // Routes to local-chat (Ollama/OpenAI upstream)

      const payload = {
        model: 'd1-router-auto',
        messages: [{ role: 'user', content: 'Explain recursion.' }],
        max_tokens: 256,
        stream: false,
      };

      const res = await app.request('/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-d1-complexity-score')).toBe('1.20');
      expect(res.headers.get('x-d1-domain')).toBe('general');
      expect(res.headers.get('x-d1-selected-model')).toBe('local-chat');
      expect(res.headers.get('x-d1-routing-latency-ms')).toBeDefined();

      const json = await res.json();
      expect(json.type).toBe('message');
      expect(json.role).toBe('assistant');
      expect(Array.isArray(json.content)).toBe(true);
      expect(json.content[0].type).toBe('text');
      expect(json.content[0].text).toContain('non-streaming response');
      expect(json.model).toBe('lfm3:latest');
    });

    it('transcodes SSE streaming from OpenAI upstream to Anthropic SSE events', async () => {
      mockD1Complexity = 1.0; // Routes to local-chat (OpenAI/Ollama upstream)

      const payload = {
        model: 'd1-router-auto',
        messages: [{ role: 'user', content: 'Stream a poem' }],
        max_tokens: 100,
        stream: true,
      };

      const res = await app.request('/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('x-d1-complexity-score')).toBe('1.00');
      expect(res.headers.get('x-d1-selected-model')).toBe('local-chat');
      expect(res.headers.get('x-d1-routing-latency-ms')).toBeDefined();

      const text = await res.text();

      // Transcoded Anthropic SSE event types
      expect(text).toContain('event: message_start');
      expect(text).toContain('event: content_block_start');
      expect(text).toContain('event: content_block_delta');
      expect(text).toContain('event: content_block_stop');
      expect(text).toContain('event: message_delta');
      expect(text).toContain('event: message_stop');

      // Verify streamed content
      expect(text).toContain('"text":"Hello from "');
      expect(text).toContain('"text":"mock OpenAI!"');
    });
  });

  describe('Virtual models policy override', () => {
    it('d1-router-cost selects lowest cost candidate for high complexity', async () => {
      // Complexity 4.0: candidates are openai-gpt4o (cost 12.5) and cloud-coder (cost 18.0)
      mockD1Complexity = 4.0;
      mockD1Domain = 'coding';

      const payload = {
        model: 'd1-router-cost',
        messages: [{ role: 'user', content: 'Design a distributed Paxos consensus system.' }],
      };

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-d1-selected-model')).toBe('openai-gpt4o');
      expect(res.headers.get('x-d1-complexity-score')).toBe('4.00');
      expect(res.headers.get('x-d1-domain')).toBe('coding');
    });

    it('d1-router-quality selects highest quality candidate for high complexity', async () => {
      // Complexity 4.0: cloud-coder has higher floor (3.0 vs 2.5) -> quality_max selects cloud-coder
      mockD1Complexity = 4.0;
      mockD1Domain = 'coding';

      const payload = {
        model: 'd1-router-quality',
        messages: [{ role: 'user', content: 'Design a distributed Paxos consensus system.' }],
      };

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-d1-selected-model')).toBe('cloud-coder');
      expect(res.headers.get('x-d1-complexity-score')).toBe('4.00');
      expect(res.headers.get('x-d1-domain')).toBe('coding');
    });

    it('direct model request routes to the specified model regardless of complexity', async () => {
      mockD1Complexity = 4.8;

      const payload = {
        model: 'local-chat',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-d1-selected-model')).toBe('local-chat');
    });
  });

  describe('Cross-provider upstream transcoding & edge cases', () => {
    it('POST /v1/chat/completions transcoding when routed to Anthropic upstream (streaming)', async () => {
      // Force route to cloud-coder (Anthropic provider)
      const payload = {
        model: 'cloud-coder',
        messages: [{ role: 'user', content: 'Write a quicksort in Rust' }],
        stream: true,
      };

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('x-d1-selected-model')).toBe('cloud-coder');

      const text = await res.text();
      expect(text).toContain('chat.completion.chunk');
      expect(text).toContain('data: [DONE]');
    });

    it('POST /v1/chat/completions converts non-streaming Anthropic response to OpenAI format', async () => {
      const payload = {
        model: 'cloud-coder',
        messages: [{ role: 'user', content: 'What is memoization?' }],
        stream: false,
      };

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-d1-selected-model')).toBe('cloud-coder');

      const json = await res.json();
      expect(json.object).toBe('chat.completion');
      expect(json.choices[0].message.role).toBe('assistant');
      expect(json.choices[0].message.content).toContain('mock Anthropic');
    });

    it('POST /v1/messages forwards directly when targeting Anthropic upstream', async () => {
      const payload = {
        model: 'cloud-coder',
        messages: [{ role: 'user', content: 'Hello Claude' }],
        max_tokens: 128,
        stream: false,
      };

      const res = await app.request('/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-d1-selected-model')).toBe('cloud-coder');

      const json = await res.json();
      expect(json.type).toBe('message');
      expect(json.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('falls back to heuristic evaluation when D1 endpoint fails', async () => {
      // Temporarily make D1 endpoint return 500
      const currentFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input: any, init?: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/v1/systemone')) {
          return new Response('D1 internal server error', { status: 500 });
        }
        return currentFetch(input, init);
      });

      const payload = {
        model: 'd1-router-auto',
        messages: [{ role: 'user', content: 'hello world' }],
      };

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-d1-complexity-score')).toBeDefined();
      expect(res.headers.get('x-d1-selected-model')).toBeDefined();
    });

    it('returns 400 when invalid JSON is sent', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ broken json ',
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });
  });
});
