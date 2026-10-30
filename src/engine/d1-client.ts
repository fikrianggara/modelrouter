import { DecisionProviderType, DECISION_PRESETS } from '../core/types';

export interface D1ScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}

export interface D1ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}

export interface D1NoulQuestion {
  type: 'noul';
  instructions: string;
}

export interface SystemOneQuestions {
  complexity: D1ScoreQuestion;
  domain: D1ChoiceQuestion;
  requires_tools: D1NoulQuestion;
  requires_vision: D1NoulQuestion;
  [key: string]: any;
}

export interface SystemOnePayload {
  model: string;
  state: string;
  questions: SystemOneQuestions;
}

export interface D1ClientOptions {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  apiKey?: string;
  provider?: DecisionProviderType;
}

export interface D1EvaluationResult {
  complexityScore: number;
  domain: 'coding' | 'reasoning' | 'tools' | 'general' | string;
  requiresTools: boolean;
  requiresVision: boolean;
  confidence: number;
  toolProbability?: number;
  visionProbability?: number;
  domainProbabilities?: Record<string, number>;
  complexityProbabilities?: Record<string, number>;
  probabilities?: {
    complexity?: Record<string, number>;
    domain?: Record<string, number>;
    requires_tools?: number;
    requires_vision?: number;
  };
  isFallback: boolean;
  fallbackReason?: string;
  provider?: DecisionProviderType | string;
  rawAnswers?: Record<string, any>;
}

export class D1Client {
  public endpoint: string;
  public model: string;
  public timeoutMs: number;
  public apiKey?: string;
  public provider: DecisionProviderType;

  constructor(
    endpointOrOptions?: string | D1ClientOptions,
    model?: string,
    timeoutMs?: number,
    apiKey?: string,
    provider?: DecisionProviderType
  ) {
    if (typeof endpointOrOptions === 'object' && endpointOrOptions !== null) {
      this.provider = endpointOrOptions.provider || 'ollama';
      const preset = DECISION_PRESETS[this.provider] || DECISION_PRESETS.ollama;
      this.endpoint = endpointOrOptions.endpoint || preset.defaultEndpoint;
      this.model = endpointOrOptions.model || preset.defaultModel;
      this.timeoutMs = endpointOrOptions.timeoutMs ?? 10000;
      this.apiKey = endpointOrOptions.apiKey;
    } else {
      this.provider = provider || 'ollama';
      const preset = DECISION_PRESETS[this.provider] || DECISION_PRESETS.ollama;
      this.endpoint = endpointOrOptions || preset.defaultEndpoint;
      this.model = model || preset.defaultModel;
      this.timeoutMs = timeoutMs ?? 10000;
      this.apiKey = apiKey;
    }
  }

  /**
   * Constructs the payload conforming to the /v1/systemone specification.
   */
  static buildPayload(state: string, model: string = 'd1:latest'): SystemOnePayload {
    return {
      model,
      state,
      questions: {
        complexity: {
          type: 'score',
          instructions: 'Rate technical complexity from 1 (trivial) to 5 (expert).',
          criteria: [
            'Level 1: Trivial greetings, chit-chat',
            'Level 2: Basic rewrite, simple fact retrieval',
            'Level 3: Standard code function, single tool call',
            'Level 4: Complex multi-file architecture, advanced algorithms',
            'Level 5: Formal mathematical proof, deep distributed systems',
          ],
        },
        domain: {
          type: 'choice',
          instructions: 'What is the primary technical domain?',
          criteria: {
            coding: 'Writing or refactoring source code',
            reasoning: 'Mathematical logic or formal proof',
            tools: 'Tool calling and file system operations',
            general: 'Casual conversation or general text',
          },
        },
        requires_tools: {
          type: 'noul',
          instructions: 'Does this request require executing external tools or APIs?',
        },
        requires_vision: {
          type: 'noul',
          instructions: 'Does this request reference or analyze images?',
        },
      },
    };
  }

  buildPayload(state: string): SystemOnePayload {
    return D1Client.buildPayload(state, this.model);
  }

  /**
   * Parses the /v1/systemone response object into a strongly-typed D1EvaluationResult.
   */
  static parseResponse(data: any, provider?: DecisionProviderType): D1EvaluationResult {
    const answers = data?.answers || {};
    const complexityAns = answers.complexity || {};
    const domainAns = answers.domain || {};
    const toolsAns = answers.requires_tools || {};
    const visionAns = answers.requires_vision || {};

    const complexityScore =
      typeof complexityAns.score === 'number' ? complexityAns.score : 1.0;

    const domain = domainAns.choice || 'general';

    const toolProbability =
      typeof toolsAns.probability === 'number' ? toolsAns.probability : undefined;

    const visionProbability =
      typeof visionAns.probability === 'number' ? visionAns.probability : undefined;

    const requiresTools = (toolProbability ?? 0) >= 0.5;
    const requiresVision = (visionProbability ?? 0) >= 0.5;

    const confidence =
      typeof complexityAns.confidence === 'number'
        ? complexityAns.confidence
        : typeof domainAns.confidence === 'number'
          ? domainAns.confidence
          : 0.5;

    const domainProbabilities = domainAns.probabilities;
    const complexityProbabilities = complexityAns.probabilities;

    return {
      complexityScore,
      domain,
      requiresTools,
      requiresVision,
      confidence,
      toolProbability,
      visionProbability,
      domainProbabilities,
      complexityProbabilities,
      probabilities: {
        complexity: complexityProbabilities,
        domain: domainProbabilities,
        requires_tools: toolProbability,
        requires_vision: visionProbability,
      },
      isFallback: false,
      provider: provider || 'ollama',
      rawAnswers: answers,
    };
  }

  parseResponse(data: any): D1EvaluationResult {
    return D1Client.parseResponse(data, this.provider);
  }

  /**
   * Deterministic rule-based heuristic fallback if the /v1/systemone endpoint is unreachable,
   * times out, or returns a non-200 error.
   */
  static fallbackEvaluate(
    state: string,
    reason?: string,
    provider?: DecisionProviderType
  ): D1EvaluationResult {
    const trimmed = (state || '').trim();

    // 1. Vision requirement detection
    const hasVision =
      /(?:\[IMAGE:|\b(?:image_url|screenshot|images?|photos?|diagrams?|png|jpg|jpeg|webp)\b)/i.test(
        trimmed
      );
    const requiresVision = hasVision;
    const visionProbability = hasVision ? 0.9 : 0.0;

    // 2. Tool requirement detection
    const hasTools =
      /(?:\[AVAILABLE_TOOLS\]:|\[TOOL_CALLS\]:|tool_calls|tools\s*:\s*\[|\b(?:execute_bash|read_file|write_file|web_search|fetch_weather|run_tests|search_logs)\b)/i.test(
        trimmed
      );
    const requiresTools = hasTools;
    const toolProbability = hasTools ? 0.95 : 0.0;

    // 3. Code blocks & code keyword detection
    const codeBlockMatches = trimmed.match(/```[\s\S]*?```/g) || [];
    const hasCodeBlocks = codeBlockMatches.length > 0;
    const codeBlockChars = codeBlockMatches.reduce((acc, b) => acc + b.length, 0);

    const codeKeywordMatches =
      trimmed.match(
        /\b(?:function|const|let|var|class|interface|type|import|export|def|return|struct|impl|fn|async|await|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE)\b/g
      ) || [];
    const hasSignificantCodeKeywords = codeKeywordMatches.length >= 2;

    const mentionsLanguage =
      /\b(?:python|typescript|javascript|rust|golang|go|c\+\+|cpp|java|csharp|swift|ruby|php|sql|bash|zsh)\b/i.test(
        trimmed
      );

    // 4. Reasoning / Mathematical proof detection
    const reasoningKeywords =
      trimmed.match(
        /\b(?:proof|prove|theorem|derivation|derive|calculate|derivative|integral|mathematical|induction|axiom|logic puzzle|formal verification|solve for)\b/gi
      ) || [];
    const hasReasoning = reasoningKeywords.length >= 1;

    // 5. Domain determination
    let domain: 'coding' | 'reasoning' | 'tools' | 'general' = 'general';

    if (
      hasCodeBlocks ||
      (mentionsLanguage && (hasSignificantCodeKeywords || /\b(?:write|refactor|debug|fix|implement|optimize)\b/i.test(trimmed)))
    ) {
      domain = 'coding';
    } else if (hasReasoning && !hasCodeBlocks) {
      domain = 'reasoning';
    } else if (
      hasTools &&
      (/\[TOOL_CALLS\]:|tool_calls|execute_trade|fetch_stock_price/i.test(trimmed) ||
        !hasReasoning)
    ) {
      domain = 'tools';
    } else {
      domain = 'general';
    }

    // 6. Complexity score calculation (scale: 1.0 - 5.0)
    // Check for trivial chit-chat greetings first
    const isGreeting =
      /^(?:hi|hello|hello there|hey|good morning|good evening|howdy|sup|ping|thanks|thank you)[.!]?$/i.test(
        trimmed
      );

    let complexityScore = 1.0;

    if (isGreeting) {
      complexityScore = 1.0;
      domain = 'general';
    } else {
      const approxTokens = Math.max(1, Math.ceil(trimmed.length / 4));

      // Baseline derived from token volume
      if (approxTokens < 30) {
        complexityScore = 1.5;
      } else if (approxTokens < 120) {
        complexityScore = 2.2;
      } else if (approxTokens < 300) {
        complexityScore = 2.8;
      } else if (approxTokens < 600) {
        complexityScore = 3.5;
      } else {
        complexityScore = 4.0;
      }

      // Feature-based score modifiers
      if (hasCodeBlocks) {
        // Level 3 is defined as "Standard code function, single tool call"
        complexityScore = Math.max(complexityScore + 0.8, 3.0);
        if (codeBlockChars > 300 || codeBlockMatches.length > 1) {
          complexityScore += 0.5;
        }
      } else if (domain === 'coding') {
        complexityScore += 0.6;
      }

      if (domain === 'reasoning') {
        complexityScore += 0.8;
        if (/\b(?:induction|formal verification|deep distributed systems|theorem)\b/i.test(trimmed)) {
          complexityScore += 0.5;
        }
      }

      if (requiresTools) {
        complexityScore = Math.max(complexityScore, 2.8);
        complexityScore += 0.3;
      }

      if (hasVision) {
        complexityScore += 0.3;
      }

      // Complex architecture / algorithmic modifiers
      const complexArchitecture =
        /\b(?:raft|paxos|consensus|distributed|concurrency|mutex|deadlock|compiler|ast|byte-order|zero-copy|red-black)\b/i.test(
          trimmed
        );
      if (complexArchitecture) {
        complexityScore += 0.8;
      }
    }

    // Clamp score to [1.0, 5.0] and round to 2 decimals
    const clampedScore = Math.min(5.0, Math.max(1.0, complexityScore));
    const finalScore = Math.round(clampedScore * 100) / 100;

    return {
      complexityScore: finalScore,
      domain,
      requiresTools,
      requiresVision,
      confidence: 0.6,
      toolProbability,
      visionProbability,
      isFallback: true,
      fallbackReason: reason || 'heuristic_fallback',
      provider: provider || 'ollama',
    };
  }

  fallbackEvaluate(state: string, reason?: string): D1EvaluationResult {
    return D1Client.fallbackEvaluate(state, reason, this.provider);
  }

  /**
   * Evaluates the prompt state against Liquid d1 via the /v1/systemone HTTP protocol.
   * If the endpoint times out (>timeoutMs) or encounters a network error, automatically falls back
   * to the deterministic heuristic evaluator.
   */
  async evaluate(
    state: string,
    options?: { timeoutMs?: number; signal?: AbortSignal; apiKey?: string }
  ): Promise<D1EvaluationResult> {
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    const apiKey = options?.apiKey ?? this.apiKey;
    const controller = new AbortController();
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`D1 evaluation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Link caller signal if provided
    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        controller.abort(options.signal?.reason);
      });
    }

    try {
      const payload = this.buildPayload(state);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const statusText =
          res.statusText ||
          (res.status === 401 ? 'Unauthorized' : res.status === 403 ? 'Forbidden' : 'Error');
        throw new Error(`D1 endpoint returned HTTP ${res.status}: ${statusText}`);
      }

      const data = await res.json();
      return this.parseResponse(data);
    } catch (err: any) {
      const reason = timedOut
        ? `D1 evaluation timeout: request timed out after ${timeoutMs}ms`
        : err?.message || String(err);
      return this.fallbackEvaluate(state, reason);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
