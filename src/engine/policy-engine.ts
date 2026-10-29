import { ModelSpec } from './registry';
import { D1EvaluationResult } from './d1-client';

export type RoutingPolicy = 'balanced' | 'cost_optimized' | 'quality_max' | 'local_first';

export interface RoutingDecision {
  selectedModel: ModelSpec;
  policyUsed: RoutingPolicy;
  reason: string;
  complexityScore: number;
}

export type EvaluationInput = D1EvaluationResult | { complexityScore: number; [key: string]: any };

export class PolicyEngine {
  static resolve(
    candidates: ModelSpec[],
    evalResult: EvaluationInput,
    policy: RoutingPolicy = 'balanced'
  ): RoutingDecision {
    if (!candidates || candidates.length === 0) {
      throw new Error('No candidate models available.');
    }

    const score = evalResult.complexityScore;

    const getTotalCost = (m: ModelSpec): number =>
      (m.cost?.input_per_mtoken ?? 0) + (m.cost?.output_per_mtoken ?? 0);

    const getMidpoint = (m: ModelSpec): number =>
      (m.complexity_range[0] + m.complexity_range[1]) / 2;

    const getCeiling = (m: ModelSpec): number => m.complexity_range[1];

    const getFloor = (m: ModelSpec): number => m.complexity_range[0];

    const isLocal = (m: ModelSpec): boolean =>
      m.provider === 'ollama' || (m.tags && m.tags.includes('local'));

    const isZeroCostLocal = (m: ModelSpec): boolean =>
      isLocal(m) && getTotalCost(m) === 0;

    let sorted: ModelSpec[];

    if (policy === 'cost_optimized') {
      sorted = [...candidates].sort((a, b) => {
        const costDiff = getTotalCost(a) - getTotalCost(b);
        if (Math.abs(costDiff) > 1e-9) return costDiff;

        // Tie-breaker 1: closer midpoint to complexity score
        const distA = Math.abs(getMidpoint(a) - score);
        const distB = Math.abs(getMidpoint(b) - score);
        const distDiff = distA - distB;
        if (Math.abs(distDiff) > 1e-9) return distDiff;

        // Tie-breaker 2: higher ceiling
        return getCeiling(b) - getCeiling(a);
      });
    } else if (policy === 'quality_max') {
      sorted = [...candidates].sort((a, b) => {
        const ceilDiff = getCeiling(b) - getCeiling(a);
        if (Math.abs(ceilDiff) > 1e-9) return ceilDiff;

        // Tie-breaker 1: higher floor (more specialized/higher minimum capability)
        const floorDiff = getFloor(b) - getFloor(a);
        if (Math.abs(floorDiff) > 1e-9) return floorDiff;

        // Tie-breaker 2: lower cost
        const costDiff = getTotalCost(a) - getTotalCost(b);
        if (Math.abs(costDiff) > 1e-9) return costDiff;

        // Tie-breaker 3: closer midpoint to complexity score
        const distA = Math.abs(getMidpoint(a) - score);
        const distB = Math.abs(getMidpoint(b) - score);
        return distA - distB;
      });
    } else if (policy === 'local_first') {
      sorted = [...candidates].sort((a, b) => {
        const aZeroLocal = isZeroCostLocal(a) ? 1 : 0;
        const bZeroLocal = isZeroCostLocal(b) ? 1 : 0;
        if (aZeroLocal !== bZeroLocal) return bZeroLocal - aZeroLocal;

        const aLocal = isLocal(a) ? 1 : 0;
        const bLocal = isLocal(b) ? 1 : 0;
        if (aLocal !== bLocal) return bLocal - aLocal;

        // Lowest cost next
        const costDiff = getTotalCost(a) - getTotalCost(b);
        if (Math.abs(costDiff) > 1e-9) return costDiff;

        // Closer midpoint distance next
        const distA = Math.abs(getMidpoint(a) - score);
        const distB = Math.abs(getMidpoint(b) - score);
        const distDiff = distA - distB;
        if (Math.abs(distDiff) > 1e-9) return distDiff;

        return getCeiling(b) - getCeiling(a);
      });
    } else {
      // Default: 'balanced'
      sorted = [...candidates].sort((a, b) => {
        const midA = getMidpoint(a);
        const midB = getMidpoint(b);
        const distA = Math.abs(midA - score);
        const distB = Math.abs(midB - score);
        const distDiff = distA - distB;
        if (Math.abs(distDiff) > 1e-9) return distDiff;

        // Tie-breaker 1: lower cost
        const costDiff = getTotalCost(a) - getTotalCost(b);
        if (Math.abs(costDiff) > 1e-9) return costDiff;

        // Tie-breaker 2: higher ceiling
        return getCeiling(b) - getCeiling(a);
      });
    }

    const selectedModel = sorted[0];
    if (!selectedModel) {
      throw new Error('No candidate models available.');
    }

    let reason: string;
    if (policy === 'cost_optimized') {
      reason = `Selected ${selectedModel.id} for minimum cost matching score ${score.toFixed(2)}`;
    } else if (policy === 'quality_max') {
      reason = `Selected ${selectedModel.id} for maximum reasoning capacity`;
    } else if (policy === 'local_first') {
      if (isZeroCostLocal(selectedModel)) {
        reason = `Selected ${selectedModel.id} as zero-cost local provider (${score.toFixed(2)})`;
      } else if (isLocal(selectedModel)) {
        reason = `Selected ${selectedModel.id} as local provider (${score.toFixed(2)})`;
      } else {
        reason = `Selected ${selectedModel.id} for local-first policy matching score ${score.toFixed(2)}`;
      }
    } else {
      reason = `Selected ${selectedModel.id} as optimal complexity fit (${score.toFixed(2)})`;
    }

    return {
      selectedModel,
      policyUsed: policy,
      reason,
      complexityScore: score,
    };
  }
}
