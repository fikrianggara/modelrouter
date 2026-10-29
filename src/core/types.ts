export interface CanonicalToolCall {
  id?: string;
  type?: 'function' | string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface CanonicalToolDefinition {
  type?: string;
  name?: string;
  description?: string;
  parameters?: Record<string, any>;
  function?: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
  [key: string]: any;
}

export interface CanonicalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: CanonicalToolCall[];
  tool_call_id?: string;
}

export interface CanonicalRequest {
  messages: CanonicalMessage[];
  system?: string;
  model_override?: string;
  policy?: 'balanced' | 'cost_optimized' | 'quality_max' | 'local_first';
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: CanonicalToolDefinition[];
  extra_params?: Record<string, any>;
}

export const CanonicalRequest = {
  extractState(req: CanonicalRequest, maxChars: number = 4000): string {
    const lines: string[] = [];

    // 1. System prompt(s)
    if (req.system) {
      lines.push(`[SYSTEM]: ${req.system}`);
    }

    const messages = req.messages || [];
    const systemMessages = messages.filter((m) => m.role === 'system');
    for (const sm of systemMessages) {
      if (!req.system || sm.content !== req.system) {
        lines.push(`[SYSTEM]: ${sm.content}`);
      }
    }

    // 2. Recent non-system dialog turns (last 4)
    const dialogMessages = messages.filter((m) => m.role !== 'system');
    const recentDialog = dialogMessages.slice(-4);
    for (const m of recentDialog) {
      let content = m.content || '';
      if (m.tool_calls && m.tool_calls.length > 0) {
        const toolCallInfo = m.tool_calls
          .map((tc) => tc.function?.name || (tc as any).name || 'unknown')
          .filter(Boolean)
          .join(', ');
        if (toolCallInfo) {
          content = content
            ? `${content} [TOOL_CALLS: ${toolCallInfo}]`
            : `[TOOL_CALLS: ${toolCallInfo}]`;
        }
      }
      lines.push(`[${m.role.toUpperCase()}]: ${content}`);
    }

    // 3. Available tools
    if (req.tools && req.tools.length > 0) {
      const toolNames = req.tools
        .map((t) => t.name || t.function?.name || '')
        .filter(Boolean);
      if (toolNames.length > 0) {
        lines.push(`[AVAILABLE_TOOLS]: ${toolNames.join(', ')}`);
      }
    }

    const full = lines.join('\n');
    return full.length > maxChars ? full.slice(-maxChars) : full;
  },
};
