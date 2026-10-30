import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Zap,
  Sliders,
  Server,
  Layers,
  ArrowRight,
  CheckCircle2,
  Terminal,
  Cpu,
} from 'lucide-react';

// ponytail: static 5-stage DAG topology with 3 complexity branch targets. Upgrade path: dynamically derive nodes and edges from active policy config and live registered models.
interface CustomNodeData {
  step: number;
  label: string;
  subtitle: string;
  badge: string;
  latency?: string;
  tag?: string;
  highlight?: boolean;
  isTarget?: boolean;
  targetType?: 'local' | 'mid' | 'frontier';
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// 1. Custom Node Components matching Firecrawl Blueprint Design System
// ---------------------------------------------------------------------------

function IngressNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const isSelected = data.isActive;
  return (
    <div
      className={`relative px-4 py-3 rounded-fc-6 bg-fc-surface border transition-all min-w-[190px] shadow-xs select-none ${
        isSelected
          ? 'border-heat-100 ring-1 ring-heat-100/50 shadow-fc-halo'
          : 'border-fc-border-faint hover:border-fc-border-muted'
      }`}
    >
      <span className="corner-crosshair top-1 left-1.5">+</span>
      <span className="corner-crosshair top-1 right-1.5">+</span>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          className={`px-1.5 py-0.5 rounded-fc-4 font-mono text-[9px] font-bold ${
            isSelected ? 'bg-heat-100 text-white' : 'bg-fc-bg-lighter text-fc-graphite border border-fc-border-faint'
          }`}
        >
          STEP 01
        </span>
        <span className="font-mono text-[10px] text-heat-100 font-medium">{data.latency}</span>
      </div>
      <div className="font-medium text-xs text-fc-graphite">{data.label}</div>
      <div className="text-[10px] text-fc-muted font-mono">{data.subtitle}</div>
      <div className="mt-2 pt-1.5 border-t border-fc-border-faint flex items-center justify-between text-[9px] font-mono text-fc-muted">
        <span>{data.badge}</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-heat-100 !border-2 !border-fc-surface"
      />
    </div>
  );
}

function SystemOneNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const isSelected = data.isActive;
  return (
    <div
      className={`relative px-4 py-3 rounded-fc-6 bg-fc-surface border transition-all min-w-[200px] shadow-xs select-none ${
        isSelected
          ? 'border-heat-100 ring-1 ring-heat-100/50 shadow-fc-halo'
          : 'border-fc-border-faint hover:border-fc-border-muted'
      }`}
    >
      <span className="corner-crosshair top-1 left-1.5">+</span>
      <span className="corner-crosshair top-1 right-1.5">+</span>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-heat-100 !border-2 !border-fc-surface"
      />
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          className={`px-1.5 py-0.5 rounded-fc-4 font-mono text-[9px] font-bold flex items-center gap-1 ${
            isSelected ? 'bg-heat-100 text-white' : 'bg-heat-12 text-heat-100 border border-heat-40'
          }`}
        >
          <Zap className="w-2.5 h-2.5 fill-current" />
          <span>STEP 02</span>
        </span>
        <span className="font-mono text-[10px] text-heat-100 font-bold">{data.latency}</span>
      </div>
      <div className="font-medium text-xs text-fc-graphite">{data.label}</div>
      <div className="text-[10px] text-fc-muted font-mono">{data.subtitle}</div>
      <div className="mt-2 pt-1.5 border-t border-fc-border-faint flex items-center justify-between text-[9px] font-mono text-fc-forest font-medium">
        <span>{data.badge}</span>
        <span className="text-[9px] text-fc-muted">c=1.0-5.0</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-heat-100 !border-2 !border-fc-surface"
      />
    </div>
  );
}

function PolicyNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const isSelected = data.isActive;
  return (
    <div
      className={`relative px-4 py-3 rounded-fc-6 bg-fc-surface border transition-all min-w-[195px] shadow-xs select-none ${
        isSelected
          ? 'border-heat-100 ring-1 ring-heat-100/50 shadow-fc-halo'
          : 'border-fc-border-faint hover:border-fc-border-muted'
      }`}
    >
      <span className="corner-crosshair top-1 left-1.5">+</span>
      <span className="corner-crosshair top-1 right-1.5">+</span>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-heat-100 !border-2 !border-fc-surface"
      />
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          className={`px-1.5 py-0.5 rounded-fc-4 font-mono text-[9px] font-bold flex items-center gap-1 ${
            isSelected ? 'bg-heat-100 text-white' : 'bg-fc-bg-lighter text-fc-graphite border border-fc-border-faint'
          }`}
        >
          <Sliders className="w-2.5 h-2.5" />
          <span>STEP 03</span>
        </span>
        <span className="font-mono text-[10px] text-heat-100 font-medium">{data.latency}</span>
      </div>
      <div className="font-medium text-xs text-fc-graphite">{data.label}</div>
      <div className="text-[10px] text-fc-muted font-mono">{data.subtitle}</div>
      <div className="mt-2 pt-1.5 border-t border-fc-border-faint flex items-center justify-between text-[9px] font-mono text-fc-muted">
        <span>{data.badge}</span>
      </div>
      {/* Three output handles for the 3 complexity tiers */}
      <Handle
        type="source"
        id="out-local"
        position={Position.Right}
        style={{ top: '25%' }}
        className="!w-2.5 !h-2.5 !bg-fc-forest !border-2 !border-fc-surface"
      />
      <Handle
        type="source"
        id="out-mid"
        position={Position.Right}
        style={{ top: '50%' }}
        className="!w-2.5 !h-2.5 !bg-fc-honey !border-2 !border-fc-surface"
      />
      <Handle
        type="source"
        id="out-frontier"
        position={Position.Right}
        style={{ top: '75%' }}
        className="!w-2.5 !h-2.5 !bg-heat-100 !border-2 !border-fc-surface"
      />
    </div>
  );
}

function ExecutionTargetNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const isSelected = data.isActive;
  const isLocal = data.targetType === 'local';
  const isMid = data.targetType === 'mid';

  const badgeColor = isLocal
    ? 'text-fc-forest border-fc-forest/30 bg-fc-forest/10'
    : isMid
    ? 'text-fc-honey border-fc-honey/30 bg-fc-honey/10'
    : 'text-heat-100 border-heat-40 bg-heat-12';

  return (
    <div
      className={`relative px-3.5 py-2.5 rounded-fc-6 bg-fc-surface border transition-all min-w-[200px] shadow-xs select-none ${
        isSelected
          ? 'border-heat-100 ring-1 ring-heat-100/50 shadow-fc-halo'
          : 'border-fc-border-faint hover:border-fc-border-muted'
      }`}
    >
      <span className="corner-crosshair top-1 left-1.5">+</span>
      <span className="corner-crosshair top-1 right-1.5">+</span>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-heat-100 !border-2 !border-fc-surface"
      />
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className={`px-1.5 py-0.5 rounded-fc-4 font-mono text-[9px] font-bold border ${badgeColor}`}>
          {data.tag}
        </span>
        <span className="font-mono text-[9px] text-fc-muted">{data.latency}</span>
      </div>
      <div className="font-medium text-xs text-fc-graphite flex items-center gap-1.5">
        <Server className="w-3 h-3 text-fc-muted shrink-0" />
        <span className="truncate">{data.label}</span>
      </div>
      <div className="text-[10px] text-fc-muted font-mono">{data.subtitle}</div>
      <div className="mt-1.5 pt-1 border-t border-fc-border-faint flex items-center justify-between text-[9px] font-mono text-fc-muted">
        <span>{data.badge}</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-heat-100 !border-2 !border-fc-surface"
      />
    </div>
  );
}

function TranscoderNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const isSelected = data.isActive;
  return (
    <div
      className={`relative px-4 py-3 rounded-fc-6 bg-fc-surface border transition-all min-w-[195px] shadow-xs select-none ${
        isSelected
          ? 'border-heat-100 ring-1 ring-heat-100/50 shadow-fc-halo'
          : 'border-fc-border-faint hover:border-fc-border-muted'
      }`}
    >
      <span className="corner-crosshair top-1 left-1.5">+</span>
      <span className="corner-crosshair top-1 right-1.5">+</span>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-heat-100 !border-2 !border-fc-surface"
      />
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          className={`px-1.5 py-0.5 rounded-fc-4 font-mono text-[9px] font-bold flex items-center gap-1 ${
            isSelected ? 'bg-heat-100 text-white' : 'bg-fc-bg-lighter text-fc-graphite border border-fc-border-faint'
          }`}
        >
          <Layers className="w-2.5 h-2.5" />
          <span>STEP 05</span>
        </span>
        <span className="font-mono text-[10px] text-heat-100 font-medium">{data.latency}</span>
      </div>
      <div className="font-medium text-xs text-fc-graphite">{data.label}</div>
      <div className="text-[10px] text-fc-muted font-mono">{data.subtitle}</div>
      <div className="mt-2 pt-1.5 border-t border-fc-border-faint flex items-center justify-between text-[9px] font-mono text-fc-muted">
        <span>{data.badge}</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-heat-100 !border-2 !border-fc-surface"
      />
    </div>
  );
}

function EgressNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const isSelected = data.isActive;
  return (
    <div
      className={`relative px-4 py-3 rounded-fc-6 bg-fc-surface border transition-all min-w-[180px] shadow-xs select-none ${
        isSelected
          ? 'border-heat-100 ring-1 ring-heat-100/50 shadow-fc-halo'
          : 'border-fc-border-faint hover:border-fc-border-muted'
      }`}
    >
      <span className="corner-crosshair top-1 left-1.5">+</span>
      <span className="corner-crosshair top-1 right-1.5">+</span>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-heat-100 !border-2 !border-fc-surface"
      />
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="px-1.5 py-0.5 rounded-fc-4 font-mono text-[9px] font-bold bg-fc-forest/15 text-fc-forest border border-fc-forest/30 flex items-center gap-1">
          <CheckCircle2 className="w-2.5 h-2.5" />
          <span>EGRESS</span>
        </span>
        <span className="font-mono text-[10px] text-fc-forest font-bold">{data.latency}</span>
      </div>
      <div className="font-medium text-xs text-fc-graphite">{data.label}</div>
      <div className="text-[10px] text-fc-muted font-mono">{data.subtitle}</div>
      <div className="mt-2 pt-1.5 border-t border-fc-border-faint flex items-center justify-between text-[9px] font-mono text-fc-muted">
        <span>{data.badge}</span>
      </div>
    </div>
  );
}

const nodeTypes = {
  ingress: IngressNode,
  systemone: SystemOneNode,
  policy: PolicyNode,
  execution: ExecutionTargetNode,
  transcoder: TranscoderNode,
  egress: EgressNode,
};

// ---------------------------------------------------------------------------
// 2. Main Graph Visualization Component
// ---------------------------------------------------------------------------

interface PipelineFlowGraphProps {
  activeStep: number;
  onSelectStep: (step: number) => void;
  avgRoutingLatencyMs?: number;
  activeModels?: number;
}

export function PipelineFlowGraph({
  activeStep,
  onSelectStep,
  avgRoutingLatencyMs,
  activeModels = 0,
}: PipelineFlowGraphProps) {
  const d1Latency = avgRoutingLatencyMs ? `${avgRoutingLatencyMs.toFixed(1)} ms` : '<15.0 ms';

  const nodes: Node<CustomNodeData>[] = useMemo(
    () => [
      {
        id: 'node-ingress',
        type: 'ingress',
        position: { x: 20, y: 155 },
        data: {
          step: 1,
          label: 'Client Ingress',
          subtitle: 'OpenAI / Anthropic APIs',
          badge: 'Dual-Protocol Parser',
          latency: '1.2 ms',
          isActive: activeStep === 1,
        },
      },
      {
        id: 'node-d1',
        type: 'systemone',
        position: { x: 260, y: 155 },
        data: {
          step: 2,
          label: 'd1 System One',
          subtitle: 'Liquid AI Neural Head',
          badge: 'Complexity Evaluator',
          latency: d1Latency,
          isActive: activeStep === 2,
        },
      },
      {
        id: 'node-policy',
        type: 'policy',
        position: { x: 510, y: 155 },
        data: {
          step: 3,
          label: 'Policy Resolution',
          subtitle: 'Deterministic Filter',
          badge: 'Strict Pareto Match',
          latency: '0.4 ms',
          isActive: activeStep === 3,
        },
      },
      // 3 Upstream Target Tiers (Step 4)
      {
        id: 'node-target-local',
        type: 'execution',
        position: { x: 760, y: 35 },
        data: {
          step: 4,
          label: 'Local Ollama',
          subtitle: 'llama3.2:3b / mistral',
          badge: 'Zero Egress ($0.00)',
          tag: '1.0 – 1.8 LOCAL',
          latency: '<20 ms',
          targetType: 'local',
          isActive: activeStep === 4,
        },
      },
      {
        id: 'node-target-mid',
        type: 'execution',
        position: { x: 760, y: 155 },
        data: {
          step: 4,
          label: '9router / Mid-Tier',
          subtitle: 'deepseek-chat / gpt-4o-mini',
          badge: 'Frugal Code ($0.14/M)',
          tag: '1.9 – 3.5 MID',
          latency: '~300 ms',
          targetType: 'mid',
          isActive: activeStep === 4,
        },
      },
      {
        id: 'node-target-frontier',
        type: 'execution',
        position: { x: 760, y: 275 },
        data: {
          step: 4,
          label: 'Frontier Cloud',
          subtitle: 'claude-3-5-sonnet / o1',
          badge: 'Deep Architecture',
          tag: '3.6 – 5.0 FRONTIER',
          latency: '~800 ms',
          targetType: 'frontier',
          isActive: activeStep === 4,
        },
      },
      {
        id: 'node-transcoder',
        type: 'transcoder',
        position: { x: 1015, y: 155 },
        data: {
          step: 5,
          label: 'Stream Transcoder',
          subtitle: 'Bidirectional SSE',
          badge: 'Zero Buffer TransformStream',
          latency: '0.8 ms',
          isActive: activeStep === 5,
        },
      },
      {
        id: 'node-egress',
        type: 'egress',
        position: { x: 1260, y: 155 },
        data: {
          step: 5,
          label: 'Client Egress',
          subtitle: 'Unified Real-Time SSE',
          badge: `${activeModels} Engines Registered`,
          latency: '<30 ms total',
          isActive: activeStep === 5,
        },
      },
    ],
    [activeStep, d1Latency, activeModels]
  );

  const edges: Edge[] = useMemo(
    () => [
      {
        id: 'e-ingress-d1',
        source: 'node-ingress',
        target: 'node-d1',
        animated: true,
        style: { stroke: '#fa5d19', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#fa5d19' },
      },
      {
        id: 'e-d1-policy',
        source: 'node-d1',
        target: 'node-policy',
        animated: true,
        style: { stroke: '#fa5d19', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#fa5d19' },
      },
      // Branching from Policy to 3 targets
      {
        id: 'e-policy-local',
        source: 'node-policy',
        sourceHandle: 'out-local',
        target: 'node-target-local',
        animated: true,
        label: 'c ≤ 1.8',
        labelStyle: { fill: '#42c366', fontFamily: 'monospace', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: 'var(--fc-surface-white)', fillOpacity: 0.9 },
        labelBgBorderRadius: 4,
        style: { stroke: '#42c366', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#42c366' },
      },
      {
        id: 'e-policy-mid',
        source: 'node-policy',
        sourceHandle: 'out-mid',
        target: 'node-target-mid',
        animated: true,
        label: '1.9 – 3.5',
        labelStyle: { fill: '#ecb730', fontFamily: 'monospace', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: 'var(--fc-surface-white)', fillOpacity: 0.9 },
        labelBgBorderRadius: 4,
        style: { stroke: '#ecb730', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#ecb730' },
      },
      {
        id: 'e-policy-frontier',
        source: 'node-policy',
        sourceHandle: 'out-frontier',
        target: 'node-target-frontier',
        animated: true,
        label: 'c ≥ 3.6',
        labelStyle: { fill: '#fa5d19', fontFamily: 'monospace', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: 'var(--fc-surface-white)', fillOpacity: 0.9 },
        labelBgBorderRadius: 4,
        style: { stroke: '#fa5d19', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#fa5d19' },
      },
      // Converging from 3 targets to Transcoder
      {
        id: 'e-local-transcoder',
        source: 'node-target-local',
        target: 'node-transcoder',
        animated: true,
        style: { stroke: '#42c36688', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#42c366' },
      },
      {
        id: 'e-mid-transcoder',
        source: 'node-target-mid',
        target: 'node-transcoder',
        animated: true,
        style: { stroke: '#ecb73088', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#ecb730' },
      },
      {
        id: 'e-frontier-transcoder',
        source: 'node-target-frontier',
        target: 'node-transcoder',
        animated: true,
        style: { stroke: '#fa5d1988', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#fa5d19' },
      },
      // From Transcoder to Egress
      {
        id: 'e-transcoder-egress',
        source: 'node-transcoder',
        target: 'node-egress',
        animated: true,
        style: { stroke: '#fa5d19', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#fa5d19' },
      },
    ],
    []
  );

  return (
    <div className="w-full h-[440px] sm:h-[480px] relative bg-fc-bg-lighter/40 select-none overflow-hidden">
      {/* Top Topology Status Bar */}
      <div className="absolute top-3 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-fc-4 bg-fc-surface/90 border border-fc-border-faint text-[10px] font-mono text-fc-muted shadow-xs backdrop-blur-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-heat-100 animate-pulse" />
          <span className="text-fc-graphite font-semibold">GRAPH TOPOLOGY</span>
          <span className="text-fc-muted-soft">//</span>
          <span>DISPATCH FLOW</span>
        </div>
        <div className="hidden sm:flex items-center gap-3 px-2.5 py-1 rounded-fc-4 bg-fc-surface/90 border border-fc-border-faint text-[10px] font-mono text-fc-muted shadow-xs backdrop-blur-xs">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-fc-forest" />
            <span>Local (1.0-1.8)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-fc-honey" />
            <span>Mid (1.9-3.5)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-heat-100" />
            <span>Frontier (3.6-5.0)</span>
          </span>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (node.data?.step) {
            onSelectStep(node.data.step);
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.4}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--fc-border-muted)" />
        <Controls
          showInteractive={false}
          className="!bg-fc-surface !border !border-fc-border-faint !rounded-fc-6 !shadow-xs [&>button]:!bg-fc-surface [&>button]:!border-fc-border-faint [&>button]:!text-fc-graphite"
        />
      </ReactFlow>

      {/* Bottom Hint */}
      <div className="absolute bottom-3 left-4 z-10 pointer-events-none">
        <span className="font-mono text-[10px] text-fc-muted/80">
          Tip: Click node to inspect stage · Drag to pan · Scroll to zoom
        </span>
      </div>
    </div>
  );
}
