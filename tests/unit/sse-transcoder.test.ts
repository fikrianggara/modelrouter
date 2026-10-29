import { describe, it, expect } from 'vitest';
import {
  createOpenAIToAnthropicTransform,
  createAnthropicToOpenAITransform,
} from '../../src/adapters/sse-transcoder';

async function pipeAndCollect(
  transform: TransformStream<string, string>,
  inputs: string[]
): Promise<string> {
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();

  const writePromise = (async () => {
    for (const chunk of inputs) {
      await writer.write(chunk);
    }
    await writer.close();
  })();

  let output = '';
  const readPromise = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += value;
    }
  })();

  await Promise.all([writePromise, readPromise]);
  return output;
}

function parseSSEEvents(raw: string): Array<{ event?: string; data: string }> {
  const lines = raw.split('\n');
  const events: Array<{ event?: string; data: string }> = [];
  let currentEvent: string | undefined;
  let currentData: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      currentData.push(line.slice(6));
    } else if (line === '') {
      if (currentData.length > 0 || currentEvent !== undefined) {
        events.push({
          event: currentEvent,
          data: currentData.join('\n'),
        });
        currentEvent = undefined;
        currentData = [];
      }
    }
  }

  if (currentData.length > 0 || currentEvent !== undefined) {
    events.push({
      event: currentEvent,
      data: currentData.join('\n'),
    });
  }

  return events;
}

describe('SSE Transcoder (TKT-007)', () => {
  describe('OpenAI to Anthropic Transform', () => {
    it('transforms standard OpenAI delta streaming sequence to Anthropic events in correct order', async () => {
      const transform = createOpenAIToAnthropicTransform('gpt-4o');
      const chunks = [
        'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":" world!"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const rawOutput = await pipeAndCollect(transform, chunks);
      const events = parseSSEEvents(rawOutput);

      // Event types in chronological sequence
      const eventTypes = events.map((e) => e.event);
      expect(eventTypes).toEqual([
        'message_start',
        'content_block_start',
        'content_block_delta',
        'content_block_delta',
        'content_block_stop',
        'message_delta',
        'message_stop',
      ]);

      // Verify message_start payload
      const msgStart = JSON.parse(events[0]!.data);
      expect(msgStart.type).toBe('message_start');
      expect(msgStart.message.role).toBe('assistant');
      expect(msgStart.message.model).toBe('gpt-4o');
      expect(msgStart.message.id).toBeDefined();

      // Verify content_block_start payload
      const blockStart = JSON.parse(events[1]!.data);
      expect(blockStart.type).toBe('content_block_start');
      expect(blockStart.index).toBe(0);
      expect(blockStart.content_block.type).toBe('text');

      // Verify content_block_delta payloads
      const delta1 = JSON.parse(events[2]!.data);
      expect(delta1.type).toBe('content_block_delta');
      expect(delta1.delta.type).toBe('text_delta');
      expect(delta1.delta.text).toBe('Hello');

      const delta2 = JSON.parse(events[3]!.data);
      expect(delta2.type).toBe('content_block_delta');
      expect(delta2.delta.type).toBe('text_delta');
      expect(delta2.delta.text).toBe(' world!');

      // Verify content_block_stop payload
      const blockStop = JSON.parse(events[4]!.data);
      expect(blockStop.type).toBe('content_block_stop');
      expect(blockStop.index).toBe(0);

      // Verify message_delta payload
      const msgDelta = JSON.parse(events[5]!.data);
      expect(msgDelta.type).toBe('message_delta');
      expect(msgDelta.delta.stop_reason).toBe('end_turn');

      // Verify message_stop payload
      const msgStop = JSON.parse(events[6]!.data);
      expect(msgStop.type).toBe('message_stop');
    });

    it('correctly reassembles TCP chunk fragmentation split across stream writes', async () => {
      const transform = createOpenAIToAnthropicTransform('gpt-4o');

      // Fragmented stream writes across arbitrary byte/character boundaries
      const fragmentedInputs = [
        'da',
        'ta: {"id":"chatcmpl-frag","choices":[{"index":0,',
        '"delta":{"con',
        'tent":"Fragmented '
        + 'chunk 1"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-frag","choices":[{"index":0,"delta":{"conte',
        'nt":" and chunk 2"},"finish_reason":null}]}\n',
        '\ndata: [DO',
        'NE]\n\n',
      ];

      const rawOutput = await pipeAndCollect(transform, fragmentedInputs);
      const events = parseSSEEvents(rawOutput);

      const deltas = events
        .filter((e) => e.event === 'content_block_delta')
        .map((e) => JSON.parse(e.data).delta.text);

      expect(deltas).toEqual(['Fragmented chunk 1', ' and chunk 2']);

      const lastEvents = events.slice(-3).map((e) => e.event);
      expect(lastEvents).toEqual(['content_block_stop', 'message_delta', 'message_stop']);
    });

    it('properly maps stream ending [DONE] to message_stop and end_turn stop_reason', async () => {
      const transform = createOpenAIToAnthropicTransform('test-model');
      const inputs = [
        'data: {"choices":[{"delta":{"content":"Finished."}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const rawOutput = await pipeAndCollect(transform, inputs);
      const events = parseSSEEvents(rawOutput);

      const msgDeltaEvent = events.find((e) => e.event === 'message_delta');
      expect(msgDeltaEvent).toBeDefined();
      const msgDelta = JSON.parse(msgDeltaEvent!.data);
      expect(msgDelta.delta.stop_reason).toBe('end_turn');

      const msgStopEvent = events.find((e) => e.event === 'message_stop');
      expect(msgStopEvent).toBeDefined();
      expect(events[events.length - 1]?.event).toBe('message_stop');
    });

    it('maps finish_reason "length" to Anthropic "max_tokens"', async () => {
      const transform = createOpenAIToAnthropicTransform('test-model');
      const inputs = [
        'data: {"choices":[{"delta":{"content":"Truncated"},"finish_reason":"length"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const rawOutput = await pipeAndCollect(transform, inputs);
      const events = parseSSEEvents(rawOutput);

      const msgDeltaEvent = events.find((e) => e.event === 'message_delta');
      expect(msgDeltaEvent).toBeDefined();
      const msgDelta = JSON.parse(msgDeltaEvent!.data);
      expect(msgDelta.delta.stop_reason).toBe('max_tokens');
    });

    it('handles empty delta and role-only delta without emitting spurious content_block_delta', async () => {
      const transform = createOpenAIToAnthropicTransform('gpt-4o');
      const inputs = [
        // Role only delta
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
        // Empty content string
        'data: {"choices":[{"delta":{"content":""}}]}\n\n',
        // Empty delta object
        'data: {"choices":[{"delta":{}}]}\n\n',
        // Real content
        'data: {"choices":[{"delta":{"content":"Real text"}}]}\n\n',
        // Another empty delta
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const rawOutput = await pipeAndCollect(transform, inputs);
      const events = parseSSEEvents(rawOutput);

      const contentDeltas = events.filter((e) => e.event === 'content_block_delta');
      expect(contentDeltas).toHaveLength(1);

      const parsedDelta = JSON.parse(contentDeltas[0]!.data);
      expect(parsedDelta.delta.text).toBe('Real text');
    });

    it('flushes closing events if stream closes without explicit [DONE]', async () => {
      const transform = createOpenAIToAnthropicTransform('gpt-4o');
      const inputs = [
        'data: {"choices":[{"delta":{"content":"Unexpected EOF"}}]}\n\n',
      ];

      const rawOutput = await pipeAndCollect(transform, inputs);
      const events = parseSSEEvents(rawOutput);

      const eventTypes = events.map((e) => e.event);
      expect(eventTypes).toContain('content_block_stop');
      expect(eventTypes).toContain('message_delta');
      expect(eventTypes).toContain('message_stop');
    });
  });

  describe('Anthropic to OpenAI Transform', () => {
    it('transforms Anthropic SSE events to OpenAI streaming chunks', async () => {
      const transform = createAnthropicToOpenAITransform('claude-3-5-sonnet');
      const inputs = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_101","type":"message","role":"assistant","model":"claude-3-5-sonnet","content":[],"stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi from Claude"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ];

      const rawOutput = await pipeAndCollect(transform, inputs);
      const events = parseSSEEvents(rawOutput);

      expect(events.length).toBeGreaterThanOrEqual(3);

      // First chunk has role
      const firstChunk = JSON.parse(events[0]!.data);
      expect(firstChunk.object).toBe('chat.completion.chunk');
      expect(firstChunk.choices[0].delta.role).toBe('assistant');
      expect(firstChunk.model).toBe('claude-3-5-sonnet');

      // Content delta chunk
      const deltaChunk = JSON.parse(events[1]!.data);
      expect(deltaChunk.choices[0].delta.content).toBe('Hi from Claude');

      // Finish reason chunk
      const finishChunk = JSON.parse(events[2]!.data);
      expect(finishChunk.choices[0].finish_reason).toBe('stop');

      // Stream ending [DONE]
      const lastEvent = events[events.length - 1];
      expect(lastEvent?.data).toBe('[DONE]');
    });

    it('handles TCP fragmentation when converting Anthropic to OpenAI', async () => {
      const transform = createAnthropicToOpenAITransform('claude-3-5-sonnet');
      const fragmentedInputs = [
        'event: message_start\nda',
        'ta: {"type":"message_start","message":{"id":"msg_202","role":"assistant","model":"claude-3-5-sonnet"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":',
        '{"type":"text_delta","text":"Partial Anthropic stream"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ];

      const rawOutput = await pipeAndCollect(transform, fragmentedInputs);
      const events = parseSSEEvents(rawOutput);

      const contentChunks = events
        .filter((e) => e.data !== '[DONE]')
        .map((e) => JSON.parse(e.data))
        .filter((payload) => payload.choices[0].delta.content);

      expect(contentChunks[0]!.choices[0].delta.content).toBe('Partial Anthropic stream');
      expect(events[events.length - 1]?.data).toBe('[DONE]');
    });
  });
});
