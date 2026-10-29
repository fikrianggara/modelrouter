import { createParser, type ParseEvent } from 'eventsource-parser';

function formatSSE(data: unknown, event?: string): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return event ? `event: ${event}\ndata: ${payload}\n\n` : `data: ${payload}\n\n`;
}

function mapOpenAIFinishReasonToAnthropic(finishReason?: string | null): string {
  switch (finishReason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
      return 'tool_use';
    default:
      return 'end_turn';
  }
}

function mapAnthropicStopReasonToOpenAI(stopReason?: string | null): string {
  switch (stopReason) {
    case 'end_turn':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'stop_sequence':
      return 'stop';
    case 'tool_use':
      return 'tool_calls';
    default:
      return 'stop';
  }
}

/**
 * Creates a TransformStream that transforms OpenAI SSE chat completion chunk stream
 * into Anthropic Messages API SSE event stream.
 *
 * Emits in sequence:
 * 1. message_start
 * 2. content_block_start
 * 3. content_block_delta (for non-empty text deltas)
 * 4. content_block_stop
 * 5. message_delta
 * 6. message_stop
 */
export function createOpenAIToAnthropicTransform(
  modelId: string = 'gpt-4o'
): TransformStream<string, string> {
  const msgId = `msg_${Math.random().toString(36).substring(2, 10)}`;
  let controllerRef: TransformStreamDefaultController<string>;
  let closed = false;
  let stopReason = 'end_turn';
  let outputTokens = 0;
  let explicitTokens = false;

  const emitClosingEvents = () => {
    if (closed) return;
    closed = true;

    controllerRef.enqueue(
      formatSSE(
        {
          type: 'content_block_stop',
          index: 0,
        },
        'content_block_stop'
      )
    );

    controllerRef.enqueue(
      formatSSE(
        {
          type: 'message_delta',
          delta: {
            stop_reason: stopReason,
            stop_sequence: null,
          },
          usage: {
            output_tokens: outputTokens,
          },
        },
        'message_delta'
      )
    );

    controllerRef.enqueue(
      formatSSE(
        {
          type: 'message_stop',
        },
        'message_stop'
      )
    );
  };

  const parser = createParser((event: ParseEvent) => {
    if (event.type !== 'event') return;

    if (event.data === '[DONE]') {
      emitClosingEvents();
      return;
    }

    try {
      const payload = JSON.parse(event.data);

      if (payload.usage?.completion_tokens != null) {
        outputTokens = payload.usage.completion_tokens;
        explicitTokens = true;
      }

      const choice = payload.choices?.[0];
      if (choice?.finish_reason) {
        stopReason = mapOpenAIFinishReasonToAnthropic(choice.finish_reason);
      }

      const text = choice?.delta?.content;
      if (typeof text === 'string' && text.length > 0) {
        if (!explicitTokens) {
          outputTokens++;
        }
        controllerRef.enqueue(
          formatSSE(
            {
              type: 'content_block_delta',
              index: 0,
              delta: {
                type: 'text_delta',
                text,
              },
            },
            'content_block_delta'
          )
        );
      }
    } catch {
      // Ignore non-JSON lines / keep stream uninterrupted
    }
  });

  return new TransformStream<string, string>({
    start(controller) {
      controllerRef = controller;

      // Emit initial Anthropic message header events
      controller.enqueue(
        formatSSE(
          {
            type: 'message_start',
            message: {
              id: msgId,
              type: 'message',
              role: 'assistant',
              model: modelId,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: {
                input_tokens: 0,
                output_tokens: 0,
              },
            },
          },
          'message_start'
        )
      );

      controller.enqueue(
        formatSSE(
          {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'text',
              text: '',
            },
          },
          'content_block_start'
        )
      );
    },
    transform(chunk) {
      parser.feed(chunk);
    },
    flush() {
      emitClosingEvents();
    },
  });
}

/**
 * Creates a TransformStream that transforms Anthropic Messages API SSE stream
 * into OpenAI chat completion chunk stream.
 *
 * Emits in sequence:
 * 1. Initial chunk with role: 'assistant'
 * 2. Delta chunks with choices[0].delta.content
 * 3. Final chunk with choices[0].finish_reason
 * 4. [DONE]
 */
export function createAnthropicToOpenAITransform(
  modelId: string = 'claude-3-5-sonnet'
): TransformStream<string, string> {
  const chunkId = `chatcmpl-${Math.random().toString(36).substring(2, 10)}`;
  const created = Math.floor(Date.now() / 1000);
  let controllerRef: TransformStreamDefaultController<string>;
  let sentRole = false;
  let closed = false;
  let finishReason = 'stop';
  let actualModel = modelId;

  const emitRoleIfNeeded = () => {
    if (sentRole) return;
    sentRole = true;
    controllerRef.enqueue(
      formatSSE({
        id: chunkId,
        object: 'chat.completion.chunk',
        created,
        model: actualModel,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content: '',
            },
            finish_reason: null,
          },
        ],
      })
    );
  };

  const emitClosingEvents = () => {
    if (closed) return;
    closed = true;

    emitRoleIfNeeded();

    controllerRef.enqueue(
      formatSSE({
        id: chunkId,
        object: 'chat.completion.chunk',
        created,
        model: actualModel,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: finishReason,
          },
        ],
      })
    );

    controllerRef.enqueue('data: [DONE]\n\n');
  };

  const parser = createParser((event: ParseEvent) => {
    if (event.type !== 'event') return;

    try {
      const payload = JSON.parse(event.data);
      const eventType = event.event || payload.type;

      if (eventType === 'message_start' && payload.message) {
        if (payload.message.model) {
          actualModel = payload.message.model;
        }
        emitRoleIfNeeded();
        return;
      }

      if (eventType === 'content_block_delta' && payload.delta?.text) {
        emitRoleIfNeeded();
        controllerRef.enqueue(
          formatSSE({
            id: chunkId,
            object: 'chat.completion.chunk',
            created,
            model: actualModel,
            choices: [
              {
                index: 0,
                delta: {
                  content: payload.delta.text,
                },
                finish_reason: null,
              },
            ],
          })
        );
        return;
      }

      if (eventType === 'message_delta' && payload.delta?.stop_reason) {
        finishReason = mapAnthropicStopReasonToOpenAI(payload.delta.stop_reason);
        return;
      }

      if (eventType === 'message_stop') {
        emitClosingEvents();
        return;
      }
    } catch {
      // Ignore non-JSON lines
    }
  });

  return new TransformStream<string, string>({
    start(controller) {
      controllerRef = controller;
    },
    transform(chunk) {
      parser.feed(chunk);
    },
    flush() {
      emitClosingEvents();
    },
  });
}
