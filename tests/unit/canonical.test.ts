import { describe, it, expect } from 'vitest';
import {
  CanonicalRequest,
  type CanonicalMessage,
  type CanonicalToolCall,
} from '../../src/core/types';

describe('CanonicalRequest & Types', () => {
  it('should instantiate CanonicalMessage, CanonicalToolCall, and CanonicalRequest properly', () => {
    const toolCall: CanonicalToolCall = {
      id: 'call_abc123',
      type: 'function',
      function: {
        name: 'fetch_weather',
        arguments: '{"city": "Tokyo"}',
      },
    };

    const message: CanonicalMessage = {
      role: 'assistant',
      content: 'Checking weather in Tokyo...',
      tool_calls: [toolCall],
    };

    const request: CanonicalRequest = {
      messages: [message],
      stream: false,
      policy: 'balanced',
    };

    expect(toolCall.id).toBe('call_abc123');
    expect(toolCall.function.name).toBe('fetch_weather');
    expect(message.role).toBe('assistant');
    expect(message.tool_calls?.[0]?.id).toBe('call_abc123');
    expect(request.policy).toBe('balanced');
  });

  describe('extractState', () => {
    it('should extract evaluation state accurately for basic requests', () => {
      const req: CanonicalRequest = {
        messages: [
          { role: 'system', content: 'You are an expert engineer.' },
          { role: 'user', content: 'Write a Raft consensus algorithm in Go.' },
        ],
        stream: true,
        tools: [{ name: 'run_tests', description: 'Run test suite' }],
      };

      const state = CanonicalRequest.extractState(req);
      expect(state).toContain('[SYSTEM]: You are an expert engineer.');
      expect(state).toContain('[USER]: Write a Raft consensus algorithm in Go.');
      expect(state).toContain('[AVAILABLE_TOOLS]: run_tests');
    });

    it('should extract top-level system prompt if provided in request.system', () => {
      const req: CanonicalRequest = {
        system: 'System instructions from top-level field',
        messages: [
          { role: 'user', content: 'Summarize the document.' },
        ],
      };

      const state = CanonicalRequest.extractState(req);
      expect(state).toContain('[SYSTEM]: System instructions from top-level field');
      expect(state).toContain('[USER]: Summarize the document.');
    });

    it('should preserve system prompt and extract only recent dialog turns in multi-turn dialogues', () => {
      const req: CanonicalRequest = {
        messages: [
          { role: 'system', content: 'Base system prompt instructions.' },
          { role: 'user', content: 'Turn 1 user message' },
          { role: 'assistant', content: 'Turn 1 assistant message' },
          { role: 'user', content: 'Turn 2 user message' },
          { role: 'assistant', content: 'Turn 2 assistant message' },
          { role: 'user', content: 'Turn 3 user message' },
          { role: 'assistant', content: 'Turn 3 assistant message' },
          { role: 'user', content: 'Turn 4 user message' },
        ],
      };

      const state = CanonicalRequest.extractState(req);

      // System prompt should be preserved
      expect(state).toContain('[SYSTEM]: Base system prompt instructions.');

      // Older turns (Turn 1 and Turn 2 user) should be excluded since only recent 4 dialog turns are kept
      expect(state).not.toContain('Turn 1 user message');
      expect(state).not.toContain('Turn 1 assistant message');
      expect(state).not.toContain('Turn 2 user message');

      // Recent 4 dialog turns should be present
      expect(state).toContain('Turn 2 assistant message');
      expect(state).toContain('Turn 3 user message');
      expect(state).toContain('Turn 3 assistant message');
      expect(state).toContain('Turn 4 user message');
    });

    it('should format tool definitions from OpenAI style and Anthropic style', () => {
      const req: CanonicalRequest = {
        messages: [
          { role: 'user', content: 'Search for flights and calculate cost.' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'flight_search',
              description: 'Search for available flights',
            },
          },
          {
            name: 'calculate_tax',
            description: 'Calculate taxes for a fare',
          },
        ],
      };

      const state = CanonicalRequest.extractState(req);
      expect(state).toContain('[AVAILABLE_TOOLS]: flight_search, calculate_tax');
    });

    it('should format assistant tool calls and tool response messages', () => {
      const req: CanonicalRequest = {
        messages: [
          { role: 'user', content: 'Check DB connection' },
          {
            role: 'assistant',
            content: 'Checking database now.',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'db_ping', arguments: '{"host":"localhost"}' },
              },
            ],
          },
          {
            role: 'tool',
            content: '{"status": "ok", "latency_ms": 2}',
            tool_call_id: 'call_1',
          },
        ],
      };

      const state = CanonicalRequest.extractState(req);
      expect(state).toContain('[USER]: Check DB connection');
      expect(state).toContain('[ASSISTANT]: Checking database now. [TOOL_CALLS: db_ping]');
      expect(state).toContain('[TOOL]: {"status": "ok", "latency_ms": 2}');
    });

    it('should truncate state string when exceeding maxChars', () => {
      const longText = 'A'.repeat(500);
      const req: CanonicalRequest = {
        messages: [
          { role: 'system', content: 'System instruction' },
          { role: 'user', content: `Long content: ${longText}` },
        ],
      };

      const maxChars = 80;
      const state = CanonicalRequest.extractState(req, maxChars);

      expect(state.length).toBeLessThanOrEqual(maxChars);
      expect(state.length).toBe(maxChars);
    });

    it('should handle edge cases with empty messages or missing content gracefully', () => {
      const emptyReq: CanonicalRequest = {
        messages: [],
      };
      expect(CanonicalRequest.extractState(emptyReq)).toBe('');

      const msgWithoutContent: CanonicalRequest = {
        messages: [
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_99',
                function: { name: 'do_something', arguments: '{}' },
              },
            ],
          },
        ],
      };
      const state = CanonicalRequest.extractState(msgWithoutContent);
      expect(state).toBe('[ASSISTANT]: [TOOL_CALLS: do_something]');
    });
  });
});
