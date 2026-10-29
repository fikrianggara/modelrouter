export interface TelemetryRequestItem {
  id: string;
  time: string;
  timestamp: number;
  promptSnippet: string;
  score: number;
  domain: string;
  model: string;
  modelId: string;
  latency: string;
  latencyMs: number;
  saving: string;
  savingUsd: number;
  costUsd: number;
  level: 'low' | 'med' | 'high';
  policy: string;
  isFallback: boolean;
}

export interface TelemetryStats {
  status: 'online';
  uptime: number;
  totalRequests: number;
  totalTokens: number;
  avgRoutingLatencyMs: number;
  totalCostUsd: number;
  totalSavedUsd: number;
  costReductionPercent: number;
  complexityDistribution: {
    '1.0-2.0': number;
    '2.0-3.0': number;
    '3.0-4.0': number;
    '4.0-5.0': number;
  };
  domainCounts: Record<string, number>;
  modelCounts: Record<string, number>;
}

export interface TelemetryEventInput {
  id?: string;
  prompt: string;
  score: number;
  domain: string;
  selectedModel: {
    id: string;
    display_name?: string;
    cost?: {
      input_per_mtoken: number;
      output_per_mtoken: number;
    };
  };
  latencyMs: number;
  policy: string;
  isFallback?: boolean;
  promptTokens?: number;
  completionTokens?: number;
}

export class TelemetryStore {
  private startTime: number = Date.now();
  private totalRequests: number = 0;
  private totalPromptTokens: number = 0;
  private totalCompletionTokens: number = 0;
  private totalRoutingLatencyMs: number = 0;
  private totalCostUsd: number = 0;
  private totalSavedUsd: number = 0;
  private recentRequests: TelemetryRequestItem[] = [];

  private complexityDistribution = {
    '1.0-2.0': 0,
    '2.0-3.0': 0,
    '3.0-4.0': 0,
    '4.0-5.0': 0,
  };

  private domainCounts: Record<string, number> = {};
  private modelCounts: Record<string, number> = {};

  recordEvent(input: TelemetryEventInput): TelemetryRequestItem {
    this.totalRequests++;

    const pTokens = input.promptTokens ?? Math.max(1, Math.round(input.prompt.length / 4));
    const cTokens = input.completionTokens ?? Math.max(1, Math.round(pTokens * 1.5));
    this.totalPromptTokens += pTokens;
    this.totalCompletionTokens += cTokens;

    this.totalRoutingLatencyMs += input.latencyMs;

    // Cost calculations
    const inputRate = input.selectedModel.cost?.input_per_mtoken ?? 0;
    const outputRate = input.selectedModel.cost?.output_per_mtoken ?? 0;
    const costUsd = (pTokens * inputRate + cTokens * outputRate) / 1_000_000;

    // Frontier baseline cost ($3.0 input, $15.0 output per 1M)
    const frontierCostUsd = (pTokens * 3.0 + cTokens * 15.0) / 1_000_000;
    const savingUsd = Math.max(0, frontierCostUsd - costUsd);

    this.totalCostUsd += costUsd;
    this.totalSavedUsd += savingUsd;

    // Complexity bucket
    if (input.score < 2.0) {
      this.complexityDistribution['1.0-2.0']++;
    } else if (input.score < 3.0) {
      this.complexityDistribution['2.0-3.0']++;
    } else if (input.score < 4.0) {
      this.complexityDistribution['3.0-4.0']++;
    } else {
      this.complexityDistribution['4.0-5.0']++;
    }

    // Domain & Model counts
    this.domainCounts[input.domain] = (this.domainCounts[input.domain] || 0) + 1;
    const modelName = input.selectedModel.display_name || input.selectedModel.id;
    this.modelCounts[modelName] = (this.modelCounts[modelName] || 0) + 1;

    const level: 'low' | 'med' | 'high' =
      input.score < 2.0 ? 'low' : input.score < 3.5 ? 'med' : 'high';

    const item: TelemetryRequestItem = {
      id: input.id || `req_${Math.random().toString(36).slice(2, 9)}`,
      time: 'Just now',
      timestamp: Date.now(),
      promptSnippet:
        input.prompt.length > 80
          ? `${input.prompt.slice(0, 80)}...`
          : input.prompt || 'Empty prompt',
      score: input.score,
      domain: input.domain,
      model: modelName,
      modelId: input.selectedModel.id,
      latency: `${input.latencyMs.toFixed(1)} ms`,
      latencyMs: input.latencyMs,
      saving: `$${savingUsd.toFixed(4)}`,
      savingUsd,
      costUsd,
      level,
      policy: input.policy,
      isFallback: Boolean(input.isFallback),
    };

    this.recentRequests.unshift(item);
    if (this.recentRequests.length > 50) {
      this.recentRequests.pop();
    }

    return item;
  }

  getStats(): TelemetryStats {
    const totalTokens = this.totalPromptTokens + this.totalCompletionTokens;
    const avgRoutingLatencyMs =
      this.totalRequests > 0
        ? Math.round((this.totalRoutingLatencyMs / this.totalRequests) * 10) / 10
        : 0;

    const baselineTotal = this.totalCostUsd + this.totalSavedUsd;
    const costReductionPercent =
      baselineTotal > 0
        ? Math.round((this.totalSavedUsd / baselineTotal) * 1000) / 10
        : 0;

    return {
      status: 'online',
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      totalRequests: this.totalRequests,
      totalTokens,
      avgRoutingLatencyMs,
      totalCostUsd: Math.round(this.totalCostUsd * 10000) / 10000,
      totalSavedUsd: Math.round(this.totalSavedUsd * 10000) / 10000,
      costReductionPercent,
      complexityDistribution: { ...this.complexityDistribution },
      domainCounts: { ...this.domainCounts },
      modelCounts: { ...this.modelCounts },
    };
  }

  getRecentRequests(): TelemetryRequestItem[] {
    return [...this.recentRequests];
  }

  reset(): void {
    this.totalRequests = 0;
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.totalRoutingLatencyMs = 0;
    this.totalCostUsd = 0;
    this.totalSavedUsd = 0;
    this.recentRequests = [];
    this.complexityDistribution = {
      '1.0-2.0': 0,
      '2.0-3.0': 0,
      '3.0-4.0': 0,
      '4.0-5.0': 0,
    };
    this.domainCounts = {};
    this.modelCounts = {};
    this.startTime = Date.now();
  }
}

export const telemetry = new TelemetryStore();
