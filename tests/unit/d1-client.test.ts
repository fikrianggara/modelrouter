import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { D1Client } from '../../src/engine/d1-client';

describe('D1Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('constructor and defaults', () => {
    it('should initialize with default parameters', () => {
      const client = new D1Client();
      expect(client.endpoint).toBe('http://localhost:11434/v1/systemone');
      expect(client.model).toBe('d1:latest');
      expect(client.timeoutMs).toBe(150);
    });

    it('should accept custom parameters', () => {
      const client = new D1Client('http://custom-d1:8000/v1/systemone', 'd1-fast:latest', 250);
      expect(client.endpoint).toBe('http://custom-d1:8000/v1/systemone');
      expect(client.model).toBe('d1-fast:latest');
      expect(client.timeoutMs).toBe(250);
    });
  });

  describe('buildPayload', () => {
    it('should construct a valid payload conforming to /v1/systemone specification', () => {
      const client = new D1Client('http://localhost:11434/v1/systemone', 'd1:latest');
      const state = '[USER]: Write a binary search algorithm in Rust.';
      const payload = client.buildPayload(state);

      expect(payload.model).toBe('d1:latest');
      expect(payload.state).toBe(state);
      expect(payload.questions).toBeDefined();

      // Complexity question
      expect(payload.questions.complexity).toEqual({
        type: 'score',
        instructions: 'Rate technical complexity from 1 (trivial) to 5 (expert).',
        criteria: [
          'Level 1: Trivial greetings, chit-chat',
          'Level 2: Basic rewrite, simple fact retrieval',
          'Level 3: Standard code function, single tool call',
          'Level 4: Complex multi-file architecture, advanced algorithms',
          'Level 5: Formal mathematical proof, deep distributed systems',
        ],
      });

      // Domain question
      expect(payload.questions.domain).toEqual({
        type: 'choice',
        instructions: 'What is the primary technical domain?',
        criteria: {
          coding: 'Writing or refactoring source code',
          reasoning: 'Mathematical logic or formal proof',
          tools: 'Tool calling and file system operations',
          general: 'Casual conversation or general text',
        },
      });

      // Requires tools question
      expect(payload.questions.requires_tools).toEqual({
        type: 'noul',
        instructions: 'Does this request require executing external tools or APIs?',
      });

      // Requires vision question
      expect(payload.questions.requires_vision).toEqual({
        type: 'noul',
        instructions: 'Does this request reference or analyze images?',
      });
    });
  });

  describe('successful /v1/systemone parsing', () => {
    it('should parse successful /v1/systemone response and map to D1EvaluationResult', async () => {
      const mockResponseBody = {
        model: 'd1:latest',
        answers: {
          complexity: {
            type: 'score',
            score: 3.42,
            probabilities: { '0': 0.01, '1': 0.04, '2': 0.15, '3': 0.48, '4': 0.32 },
            confidence: 0.52,
          },
          domain: {
            type: 'choice',
            choice: 'coding',
            probabilities: { coding: 0.98, reasoning: 0.01, tools: 0.005, general: 0.005 },
            confidence: 0.97,
          },
          requires_tools: {
            type: 'noul',
            probability: 0.88,
          },
          requires_vision: {
            type: 'noul',
            probability: 0.02,
          },
        },
        usage: {
          input_tokens: 128,
          output_tokens: 0,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponseBody,
      });

      const client = new D1Client('http://localhost:11434/v1/systemone');
      const result = await client.evaluate('Write a quicksort in Python');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [fetchUrl, fetchOptions] = (global.fetch as any).mock.calls[0];
      expect(fetchUrl).toBe('http://localhost:11434/v1/systemone');
      expect(fetchOptions.method).toBe('POST');
      expect(fetchOptions.headers).toEqual({ 'Content-Type': 'application/json' });

      const parsedBody = JSON.parse(fetchOptions.body);
      expect(parsedBody.model).toBe('d1:latest');
      expect(parsedBody.state).toBe('Write a quicksort in Python');

      expect(result.complexityScore).toBe(3.42);
      expect(result.domain).toBe('coding');
      expect(result.requiresTools).toBe(true);
      expect(result.requiresVision).toBe(false);
      expect(result.confidence).toBe(0.52);
      expect(result.isFallback).toBe(false);
    });
  });

  describe('confidence and probability extraction', () => {
    it('should extract probability distributions and domain/complexity confidences', async () => {
      const mockResponse = {
        model: 'd1:latest',
        answers: {
          complexity: {
            type: 'score',
            score: 4.15,
            probabilities: { '0': 0.0, '1': 0.02, '2': 0.08, '3': 0.25, '4': 0.65 },
            confidence: 0.74,
          },
          domain: {
            type: 'choice',
            choice: 'reasoning',
            probabilities: { coding: 0.05, reasoning: 0.85, tools: 0.02, general: 0.08 },
            confidence: 0.85,
          },
          requires_tools: {
            type: 'noul',
            probability: 0.12,
          },
          requires_vision: {
            type: 'noul',
            probability: 0.91,
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const client = new D1Client();
      const result = await client.evaluate('Analyze this proof and diagram');

      expect(result.confidence).toBe(0.74);
      expect(result.toolProbability).toBe(0.12);
      expect(result.visionProbability).toBe(0.91);
      expect(result.domainProbabilities).toEqual({
        coding: 0.05,
        reasoning: 0.85,
        tools: 0.02,
        general: 0.08,
      });
      expect(result.complexityProbabilities).toEqual({
        '0': 0.0,
        '1': 0.02,
        '2': 0.08,
        '3': 0.25,
        '4': 0.65,
      });
      expect(result.probabilities?.requires_tools).toBe(0.12);
      expect(result.probabilities?.requires_vision).toBe(0.91);
    });

    it('should handle missing confidence gracefully with fallback value', async () => {
      const mockResponse = {
        model: 'd1:latest',
        answers: {
          complexity: {
            type: 'score',
            score: 2.0,
          },
          domain: {
            type: 'choice',
            choice: 'general',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const client = new D1Client();
      const result = await client.evaluate('Simple greeting');

      expect(result.complexityScore).toBe(2.0);
      expect(result.domain).toBe('general');
      expect(result.confidence).toBe(0.5);
      expect(result.requiresTools).toBe(false);
      expect(result.requiresVision).toBe(false);
    });
  });

  describe('tool and vision requirement detection', () => {
    it('should detect tool requirement when probability >= 0.5', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          answers: {
            complexity: { score: 3.0 },
            domain: { choice: 'tools' },
            requires_tools: { probability: 0.50 },
            requires_vision: { probability: 0.49 },
          },
        }),
      });

      const client = new D1Client();
      const result = await client.evaluate('Check the weather');
      expect(result.requiresTools).toBe(true);
      expect(result.requiresVision).toBe(false);
    });

    it('should detect vision requirement when probability >= 0.5', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          answers: {
            complexity: { score: 2.5 },
            domain: { choice: 'general' },
            requires_tools: { probability: 0.1 },
            requires_vision: { probability: 0.75 },
          },
        }),
      });

      const client = new D1Client();
      const result = await client.evaluate('Describe this image');
      expect(result.requiresTools).toBe(false);
      expect(result.requiresVision).toBe(true);
    });

    it('should treat missing requires_tools and requires_vision as false', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          answers: {
            complexity: { score: 1.0 },
            domain: { choice: 'general' },
          },
        }),
      });

      const client = new D1Client();
      const result = await client.evaluate('Hello');
      expect(result.requiresTools).toBe(false);
      expect(result.requiresVision).toBe(false);
    });
  });

  describe('fallbackEvaluate() heuristic', () => {
    const client = new D1Client();

    it('should evaluate trivial chit-chat with Level 1 complexity and general domain', () => {
      const result = client.fallbackEvaluate('Hello there!');
      expect(result.isFallback).toBe(true);
      expect(result.complexityScore).toBeLessThanOrEqual(1.5);
      expect(result.domain).toBe('general');
      expect(result.requiresTools).toBe(false);
      expect(result.requiresVision).toBe(false);
    });

    it('should evaluate prompt with code blocks as coding domain with elevated complexity', () => {
      const codePrompt = `
[USER]: Here is a snippet of TypeScript code:
\`\`\`typescript
interface User {
  id: string;
  name: string;
}
function processUsers(users: User[]): Map<string, User> {
  return new Map(users.map(u => [u.id, u]));
}
\`\`\`
Can you optimize this implementation?
`;
      const result = client.fallbackEvaluate(codePrompt);
      expect(result.isFallback).toBe(true);
      expect(result.domain).toBe('coding');
      expect(result.complexityScore).toBeGreaterThanOrEqual(3.0);
      expect(result.requiresTools).toBe(false);
    });

    it('should evaluate prompt with tool mentions or tool definitions as requiring tools', () => {
      const toolPrompt = `
[USER]: Check the server logs.
[AVAILABLE_TOOLS]: read_file, execute_bash, search_logs
`;
      const result = client.fallbackEvaluate(toolPrompt);
      expect(result.isFallback).toBe(true);
      expect(result.requiresTools).toBe(true);
      expect(result.complexityScore).toBeGreaterThanOrEqual(2.5);
    });

    it('should evaluate prompt with tool_calls in recent turns as requiring tools and tools domain', () => {
      const toolCallsPrompt = `
[ASSISTANT]: [TOOL_CALLS: fetch_stock_price, execute_trade]
[USER]: What is the result?
`;
      const result = client.fallbackEvaluate(toolCallsPrompt);
      expect(result.isFallback).toBe(true);
      expect(result.requiresTools).toBe(true);
      expect(result.domain).toBe('tools');
    });

    it('should evaluate image mentions as requiring vision', () => {
      const visionPrompt = '[USER]: What is shown in [IMAGE: screenshot.png] file?';
      const result = client.fallbackEvaluate(visionPrompt);
      expect(result.isFallback).toBe(true);
      expect(result.requiresVision).toBe(true);
    });

    it('should scale complexity based on token count / length for long prompts', () => {
      const shortPrompt = 'Tell me a short joke.';
      const shortResult = client.fallbackEvaluate(shortPrompt);

      // Generate a long text without code blocks or tools
      const longPrompt = 'Please summarize and explain the following comprehensive background information:\n' +
        'In the study of modern organizational psychology, numerous factors influence team collaboration.\n'.repeat(30);
      const longResult = client.fallbackEvaluate(longPrompt);

      expect(longResult.complexityScore).toBeGreaterThan(shortResult.complexityScore);
    });

    it('should identify mathematical / reasoning domain when reasoning indicators are dominant', () => {
      const reasoningPrompt = 'Prove by induction that for all n >= 1, the sum of the first n odd numbers is n^2. Show theorem and formal mathematical proof.';
      const result = client.fallbackEvaluate(reasoningPrompt);
      expect(result.isFallback).toBe(true);
      expect(result.domain).toBe('reasoning');
      expect(result.complexityScore).toBeGreaterThanOrEqual(3.5);
    });

    it('should produce deterministic results for identical inputs', () => {
      const prompt = 'Implement Raft distributed consensus state machine with mutex locks in Go.';
      const res1 = client.fallbackEvaluate(prompt);
      const res2 = client.fallbackEvaluate(prompt);

      expect(res1).toEqual(res2);
    });
  });

  describe('error handling and timeout abort with fallback', () => {
    it('should fallback to heuristic when /v1/systemone returns non-200 HTTP status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const client = new D1Client();
      const result = await client.evaluate('Write a quick Python script');

      expect(result.isFallback).toBe(true);
      expect(result.fallbackReason).toContain('503');
      expect(result.domain).toBe('coding');
    });

    it('should fallback to heuristic when fetch throws network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:11434'));

      const client = new D1Client();
      const result = await client.evaluate('What is the weather today?');

      expect(result.isFallback).toBe(true);
      expect(result.fallbackReason).toContain('ECONNREFUSED');
      expect(result.domain).toBe('general');
    });

    it('should abort and fallback to heuristic when request exceeds timeoutMs', async () => {
      // Mock fetch that hangs until aborted by signal
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const abortErr = new Error('The operation was aborted');
              abortErr.name = 'AbortError';
              reject(abortErr);
            });
          }
        });
      });

      const timeoutMs = 50;
      const client = new D1Client('http://localhost:11434/v1/systemone', 'd1:latest', timeoutMs);

      const startTime = Date.now();
      const result = await client.evaluate('Calculate the derivative of f(x) = x^3');
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(40);
      expect(result.isFallback).toBe(true);
      expect(result.fallbackReason).toMatch(/abort|timeout/i);
      expect(result.domain).toBe('reasoning');
    });

    it('should support static D1Client.fallbackEvaluate as convenience helper', () => {
      const result = D1Client.fallbackEvaluate('Hello world');
      expect(result.isFallback).toBe(true);
      expect(result.domain).toBe('general');
    });
  });
});
