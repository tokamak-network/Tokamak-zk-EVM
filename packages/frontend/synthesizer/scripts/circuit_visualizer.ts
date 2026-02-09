#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';
import zlib from 'node:zlib';
import os from 'node:os';
import { spawn } from 'node:child_process';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Resvg } from '@resvg/resvg-js';

type DataPt = {
  source: number;
  wireIndex?: number;
  extSource?: string;
  extDest?: string;
};

type PlacementEntry = {
  name: string;
  usage?: string;
  subcircuitId: number;
  inPts: DataPt[];
  outPts: DataPt[];
};

type DiagramFormat = 'elk' | 'mermaid' | 'builtin' | 'list' | '3d';

type EdgeInfo = {
  from: number;
  to: number;
  count: number;
};

type Segment2D = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

const DEFAULT_INPUT = path.resolve(packageRoot, 'outputs', 'analysis', 'circuit_placements.json');

const parseArgs = () =>
  minimist(process.argv.slice(2), {
    string: [
      'input',
      'output',
      'format',
      'scale',
      'max-dim',
      'maxDim',
      'layer-spacing',
      'layerSpacing',
      'long-edge',
      'longEdge',
    ],
    boolean: ['detail', 'help', 'tower'],
    alias: {
      i: 'input',
      o: 'output',
      f: 'format',
      d: 'detail',
      h: 'help',
    },
  });

const usage = () => `
Usage:
  tsx scripts/circuit_visualizer.ts [--input path] [--format elk|mermaid|builtin|list|3d] [--output path] [--detail] [--scale N] [--max-dim N] [--layer-spacing N] [--long-edge N] [--tower]

Defaults:
  --input  ${path.relative(process.cwd(), DEFAULT_INPUT)}
  --format 3d
  --output outputs/analysis/circuit_diagram_3d.html

Notes:
  Output is PNG for elk/mermaid/builtin/list. For 3d, output is HTML.
  --detail adds placement usage text into node labels (elk/mermaid/builtin/3d).
  --scale controls PNG render scale (default: 2).
  --max-dim clamps the longer side of the PNG (default: 12000, 0 to disable).
  --format 3d outputs an interactive HTML file instead of PNG.
  --layer-spacing controls Z spacing between wire layers in 3d (default: 40).
  --long-edge adds extra layers when edge length exceeds this value (default: 400, 0 to disable).
  --tower stacks one block per layer (3d only, default: false).
`;

const normalizeFormat = (value: unknown): DiagramFormat => {
  const normalized = String(value ?? '3d').trim().toLowerCase();
  if (normalized === 'elk' || normalized === 'mermaid' || normalized === 'builtin' || normalized === 'list' || normalized === '3d') {
    return normalized as DiagramFormat;
  }
  if (normalized === 'diagram') {
    return 'builtin';
  }
  if (normalized === 'ascii') {
    return 'list';
  }
  throw new Error(`Unknown format "${value}". Use "elk", "mermaid", "builtin", "list", or "3d".`);
};

const readPlacements = async (inputPath: string): Promise<PlacementEntry[]> => {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Expected circuit placements JSON to be an array.');
  }
  return parsed as PlacementEntry[];
};

const buildEdges = (placements: PlacementEntry[]) => {
  const edges = new Map<string, EdgeInfo>();
  const externalInCounts = new Map<number, number>();
  const warnings: string[] = [];

  placements.forEach((placement, toId) => {
    let externalCount = 0;
    const inPts = Array.isArray(placement.inPts) ? placement.inPts : [];
    for (const inPt of inPts) {
      if (!inPt || typeof inPt.source !== 'number' || !Number.isInteger(inPt.source)) {
        warnings.push(`Skipping input with non-numeric source at placement ${toId}.`);
        externalCount += 1;
        continue;
      }
      if (inPt.source === toId) {
        externalCount += 1;
        continue;
      }
      if (inPt.source < 0 || inPt.source >= placements.length) {
        warnings.push(
          `Skipping input with out-of-range source ${inPt.source} at placement ${toId}.`,
        );
        externalCount += 1;
        continue;
      }
      const key = `${inPt.source}->${toId}`;
      const existing = edges.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        edges.set(key, { from: inPt.source, to: toId, count: 1 });
      }
    }
    externalInCounts.set(toId, externalCount);
  });

  return { edges, externalInCounts, warnings };
};

const renderAscii = (
  placements: PlacementEntry[],
  edges: EdgeInfo[],
  externalInCounts: Map<number, number>,
  detail: boolean,
) => {
  const lines: string[] = [];
  lines.push('Nodes:');
  placements.forEach((placement, id) => {
    const externalCount = externalInCounts.get(id) ?? 0;
    const parts = [
      `[${id}] ${placement.name} (${placement.subcircuitId})`,
      `extIn=${externalCount}`,
    ];
    if (detail && placement.usage) {
      parts.push(`usage="${placement.usage}"`);
    }
    lines.push(parts.join(' | '));
  });
  lines.push('');
  lines.push('Edges:');
  if (edges.length === 0) {
    lines.push('(none)');
  } else {
    const sortedEdges = edges.slice().sort((a, b) => {
      if (a.from !== b.from) return a.from - b.from;
      return a.to - b.to;
    });
    sortedEdges.forEach((edge) => {
      const fromPlacement = placements[edge.from];
      const toPlacement = placements[edge.to];
      const fromName = fromPlacement
        ? `${fromPlacement.name} (${fromPlacement.subcircuitId})`
        : 'unknown';
      const toName = toPlacement
        ? `${toPlacement.name} (${toPlacement.subcircuitId})`
        : 'unknown';
      lines.push(
        `[${edge.from}] ${fromName} -> [${edge.to}] ${toName} (wires=${edge.count})`,
      );
    });
  }
  return `${lines.join('\n')}\n`;
};

const escapeMermaidLabel = (value: string) =>
  value.replace(/"/g, "'").replace(/\r?\n/g, ' ');

const renderMermaidSource = (
  placements: PlacementEntry[],
  edges: EdgeInfo[],
  externalInCounts: Map<number, number>,
  detail: boolean,
) => {
  const lines: string[] = ['flowchart LR'];
  placements.forEach((placement, id) => {
    const parts = [
      `${placement.name} (${placement.subcircuitId})`,
    ];
    const externalCount = externalInCounts.get(id) ?? 0;
    if (externalCount > 0) {
      parts.push(`extIn=${externalCount}`);
    }
    if (detail && placement.usage) {
      parts.push(placement.usage);
    }
    const label = escapeMermaidLabel(parts.join('<br/>'));
    lines.push(`P${id}["${label}"]`);
  });

  const sortedEdges = edges.slice().sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from;
    return a.to - b.to;
  });
  sortedEdges.forEach((edge) => {
    lines.push(`P${edge.from} --> P${edge.to}`);
  });

  return `${lines.join('\n')}\n`;
};

type ElkLabel = { text: string; x?: number; y?: number };
type ElkPoint = { x: number; y: number };
type ElkSection = { startPoint: ElkPoint; endPoint: ElkPoint; bendPoints?: ElkPoint[] };
type ElkEdge = { id: string; sources?: string[]; targets?: string[]; sections?: ElkSection[]; labels?: ElkLabel[] };
type ElkNode = {
  id: string;
  layoutOptions?: Record<string, string>;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  labels?: ElkLabel[];
  children?: ElkNode[];
  edges?: ElkEdge[];
  ports?: ElkPort[];
};

type ElkPort = {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  layoutOptions?: Record<string, string>;
};

type PortMeta = {
  id: string;
  nodeId: string;
  side: 'NORTH' | 'SOUTH';
  index: number;
  label?: string;
  labelTier: number;
};

const ELK_STYLE = {
  fontFamily: 'monospace',
  fontSize: 12,
  lineHeight: 16,
  paddingX: 12,
  paddingY: 10,
  margin: 24,
};

const PORT_SIZE = 6;
const PORT_ARROW_LEN = 10;
const PORT_SPACING = 14;
const PORT_LABEL_MAX = 28;
const PORT_LABEL_WRAP = 14;

const clampLabel = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
};

const estimateTextWidth = (text: string, fontSize: number) => text.length * fontSize * 0.6;

const buildNodeLines = (
  placement: PlacementEntry,
  externalCount: number,
  detail: boolean,
) => {
  const maxLen = 32;
  const lines = [
    clampLabel(`${placement.name} (${placement.subcircuitId})`, maxLen),
  ];
  if (externalCount > 0) {
    lines.push(clampLabel(`extIn ${externalCount}`, maxLen));
  }
  if (detail && placement.usage) {
    lines.push(clampLabel(placement.usage, maxLen));
  }
  return lines;
};

const wrapPortLabel = (value: string) => {
  const trimmed = clampLabel(value, PORT_LABEL_MAX * 2);
  if (trimmed.length <= PORT_LABEL_WRAP) {
    return trimmed;
  }
  const splitIndex = trimmed.lastIndexOf(' ', PORT_LABEL_WRAP);
  if (splitIndex > 6) {
    return `${trimmed.slice(0, splitIndex)}\n${trimmed.slice(splitIndex + 1)}`;
  }
  return `${trimmed.slice(0, PORT_LABEL_WRAP)}\n${trimmed.slice(PORT_LABEL_WRAP)}`;
};

const buildElkGraph = (
  placements: PlacementEntry[],
  edges: EdgeInfo[],
  externalInCounts: Map<number, number>,
  detail: boolean,
) => {
  const labelById = new Map<string, string[]>();
  const portMetaById = new Map<string, PortMeta>();
  const edgeEndpointsById = new Map<string, { source: string; target: string }>();
  const nodes: ElkNode[] = placements.map((placement, id) => {
    const lines = buildNodeLines(placement, externalInCounts.get(id) ?? 0, detail);
    labelById.set(`n${id}`, lines);
    const maxLine = Math.max(...lines.map((line) => line.length), 1);
    const textWidth = estimateTextWidth('X'.repeat(maxLine), ELK_STYLE.fontSize);
    const portCountMax = Math.max(placement.inPts.length, placement.outPts.length, 1);
    const minPortWidth = (portCountMax + 1) * PORT_SPACING;
    const width = Math.max(240, Math.ceil(textWidth + ELK_STYLE.paddingX * 2), minPortWidth);
    const height = Math.ceil(lines.length * ELK_STYLE.lineHeight + ELK_STYLE.paddingY * 2);

    const inputPorts: ElkPort[] = placement.inPts.map((pt, idx) => {
      const idStr = `n${id}_in_${idx}`;
      const label = pt.extSource ? wrapPortLabel(pt.extSource) : undefined;
      portMetaById.set(idStr, {
        id: idStr,
        nodeId: `n${id}`,
        side: 'NORTH',
        index: idx,
        label,
        labelTier: idx % 3,
      });
      const spacing = width / (placement.inPts.length + 1);
      const x = Math.round((idx + 1) * spacing - PORT_SIZE / 2);
      return {
        id: idStr,
        width: PORT_SIZE,
        height: PORT_SIZE,
        x,
        y: 0,
        layoutOptions: {
          'elk.port.side': 'NORTH',
          'elk.port.index': String(idx),
        },
      };
    });

    const outputEntries = placement.outPts
      .map((pt, idx) => ({
        pt,
        wireIndex: Number.isInteger(pt.wireIndex) ? pt.wireIndex! : idx,
      }))
      .sort((a, b) => a.wireIndex - b.wireIndex);
    const outputPorts: ElkPort[] = outputEntries.map((entry, idx) => {
      const idStr = `n${id}_out_${entry.wireIndex}`;
      const label = entry.pt.extDest ? wrapPortLabel(entry.pt.extDest) : undefined;
      portMetaById.set(idStr, {
        id: idStr,
        nodeId: `n${id}`,
        side: 'SOUTH',
        index: idx,
        label,
        labelTier: idx % 3,
      });
      const spacing = width / (outputEntries.length + 1);
      const x = Math.round((idx + 1) * spacing - PORT_SIZE / 2);
      return {
        id: idStr,
        width: PORT_SIZE,
        height: PORT_SIZE,
        x,
        y: height - PORT_SIZE,
        layoutOptions: {
          'elk.port.side': 'SOUTH',
          'elk.port.index': String(idx),
        },
      };
    });

    return {
      id: `n${id}`,
      width,
      height,
      labels: [{ text: lines.join(' / ') }],
      ports: [...inputPorts, ...outputPorts],
      layoutOptions: {
        'elk.portConstraints': 'FIXED_POS',
      },
    };
  });

  const elkEdges: ElkEdge[] = [];
  placements.forEach((placement, targetId) => {
    placement.inPts.forEach((inPt, inputIdx) => {
      if (inPt.source === targetId) {
        return;
      }
      if (inPt.source < 0 || inPt.source >= placements.length) {
        return;
      }
      const sourcePlacement = placements[inPt.source];
      const sourceWireIndex = inPt.wireIndex ?? 0;
      if (!sourcePlacement || sourceWireIndex < 0 || sourceWireIndex >= sourcePlacement.outPts.length) {
        return;
      }
      elkEdges.push({
        id: `e_${inPt.source}_${sourceWireIndex}_to_${targetId}_${inputIdx}`,
        sources: [`n${inPt.source}_out_${sourceWireIndex}`],
        targets: [`n${targetId}_in_${inputIdx}`],
      });
      edgeEndpointsById.set(
        `e_${inPt.source}_${sourceWireIndex}_to_${targetId}_${inputIdx}`,
        { source: `n${inPt.source}`, target: `n${targetId}` },
      );
    });
  });

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '32',
      'elk.spacing.nodeNode': '14',
      'elk.spacing.edgeEdge': '6',
      'elk.spacing.edgeNode': '10',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.mergeEdges': 'true',
    },
    children: nodes,
    edges: elkEdges,
  };

  return { graph, labelById, portMetaById, edgeEndpointsById };
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const renderElkSvg = (
  layout: ElkNode,
  labelById: Map<string, string[]>,
  portMetaById: Map<string, PortMeta>,
) => {
  const width = Math.ceil((layout.width ?? 0) + ELK_STYLE.margin * 2);
  const height = Math.ceil((layout.height ?? 0) + ELK_STYLE.margin * 2);
  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  lines.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  lines.push('<defs>');
  lines.push(
    '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">',
  );
  lines.push('<path d="M 0 0 L 10 5 L 0 10 z" fill="#4b4b4b" />');
  lines.push('</marker>');
  lines.push('</defs>');

  const edges = layout.edges ?? [];
  edges.forEach((edge) => {
    const sections = edge.sections ?? [];
    sections.forEach((section) => {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      if (points.length < 2) return;
      const d = points
        .map((point, idx) => {
          const x = point.x + ELK_STYLE.margin;
          const y = point.y + ELK_STYLE.margin;
          return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' ');
      lines.push(
        `<path d="${d}" fill="none" stroke="#4b4b4b" stroke-width="1.2" />`,
      );
    });
  });

  const nodes = layout.children ?? [];
  nodes.forEach((node) => {
    const x = (node.x ?? 0) + ELK_STYLE.margin;
    const y = (node.y ?? 0) + ELK_STYLE.margin;
    const width = node.width ?? 120;
    const height = node.height ?? 60;
    lines.push(
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" ry="6" fill="#f7f7f7" stroke="#333333" stroke-width="1" />`,
    );
    const labels = labelById.get(node.id) ?? [node.id];
    const totalTextHeight = labels.length * ELK_STYLE.lineHeight;
    let textY = y + (height - totalTextHeight) / 2 + ELK_STYLE.fontSize;
    const centerX = x + width / 2;
    lines.push(
      `<text x="${centerX}" y="${textY}" font-family="${ELK_STYLE.fontFamily}" font-size="${ELK_STYLE.fontSize}" text-anchor="middle" fill="#111111">`,
    );
    labels.forEach((line, idx) => {
      const dy = idx === 0 ? 0 : ELK_STYLE.lineHeight;
      lines.push(
        `<tspan x="${centerX}" dy="${dy}">${escapeXml(line)}</tspan>`,
      );
    });
    lines.push('</text>');

    const ports = node.ports ?? [];
    ports.forEach((port) => {
      const meta = portMetaById.get(port.id);
      if (!meta) {
        return;
      }
      const portX = (port.x ?? 0) + (port.width ?? PORT_SIZE) / 2;
      const portY = (port.y ?? 0) + (meta.side === 'SOUTH' ? (port.height ?? PORT_SIZE) : 0);
      const absX = x + portX;
      const absY = y + portY;
      const arrowStartY = meta.side === 'NORTH' ? absY - PORT_ARROW_LEN : absY;
      const arrowEndY = meta.side === 'NORTH' ? absY : absY + PORT_ARROW_LEN;
      lines.push(
        `<path d="M ${absX} ${arrowStartY} L ${absX} ${arrowEndY}" fill="none" stroke="#4b4b4b" stroke-width="1.2" marker-end="url(#arrow)" />`,
      );
      if (meta.label) {
        const labelY = meta.side === 'NORTH' ? arrowStartY - 4 : arrowEndY + 12;
        lines.push(
          `<text x="${absX}" y="${labelY}" font-family="${ELK_STYLE.fontFamily}" font-size="10" text-anchor="middle" fill="#333333">${escapeXml(
            meta.label,
          )}</text>`,
        );
      }
    });
  });

  lines.push('</svg>');
  return `${lines.join('\n')}\n`;
};

type Rgba = { r: number; g: number; b: number; a: number };

const COLORS = {
  background: { r: 255, g: 255, b: 255, a: 255 },
  border: { r: 30, g: 30, b: 30, a: 255 },
  boxFill: { r: 245, g: 245, b: 245, a: 255 },
  edge: { r: 90, g: 90, b: 90, a: 255 },
  text: { r: 20, g: 20, b: 20, a: 255 },
};

const FONT = new Map<string, string[]>([
  [' ', ['00000', '00000', '00000', '00000', '00000', '00000', '00000']],
  ['#', ['00100', '00100', '11111', '00100', '11111', '00100', '00100']],
  ['0', ['01110', '10001', '10011', '10101', '11001', '10001', '01110']],
  ['1', ['00100', '01100', '00100', '00100', '00100', '00100', '01110']],
  ['2', ['01110', '10001', '00001', '00010', '00100', '01000', '11111']],
  ['3', ['11110', '00001', '00001', '01110', '00001', '00001', '11110']],
  ['4', ['00010', '00110', '01010', '10010', '11111', '00010', '00010']],
  ['5', ['11111', '10000', '10000', '11110', '00001', '00001', '11110']],
  ['6', ['01110', '10000', '10000', '11110', '10001', '10001', '01110']],
  ['7', ['11111', '00001', '00010', '00100', '01000', '01000', '01000']],
  ['8', ['01110', '10001', '10001', '01110', '10001', '10001', '01110']],
  ['9', ['01110', '10001', '10001', '01111', '00001', '00010', '11100']],
  ['A', ['01110', '10001', '10001', '11111', '10001', '10001', '10001']],
  ['B', ['11110', '10001', '10001', '11110', '10001', '10001', '11110']],
  ['C', ['01110', '10001', '10000', '10000', '10000', '10001', '01110']],
  ['D', ['11110', '10001', '10001', '10001', '10001', '10001', '11110']],
  ['E', ['11111', '10000', '10000', '11110', '10000', '10000', '11111']],
  ['F', ['11111', '10000', '10000', '11110', '10000', '10000', '10000']],
  ['G', ['01110', '10001', '10000', '10111', '10001', '10001', '01110']],
  ['H', ['10001', '10001', '10001', '11111', '10001', '10001', '10001']],
  ['I', ['11111', '00100', '00100', '00100', '00100', '00100', '11111']],
  ['J', ['00111', '00010', '00010', '00010', '00010', '10010', '01100']],
  ['K', ['10001', '10010', '10100', '11000', '10100', '10010', '10001']],
  ['L', ['10000', '10000', '10000', '10000', '10000', '10000', '11111']],
  ['M', ['10001', '11011', '10101', '10101', '10001', '10001', '10001']],
  ['N', ['10001', '11001', '10101', '10011', '10001', '10001', '10001']],
  ['O', ['01110', '10001', '10001', '10001', '10001', '10001', '01110']],
  ['P', ['11110', '10001', '10001', '11110', '10000', '10000', '10000']],
  ['Q', ['01110', '10001', '10001', '10001', '10101', '10010', '01101']],
  ['R', ['11110', '10001', '10001', '11110', '10100', '10010', '10001']],
  ['S', ['01111', '10000', '10000', '01110', '00001', '00001', '11110']],
  ['T', ['11111', '00100', '00100', '00100', '00100', '00100', '00100']],
  ['U', ['10001', '10001', '10001', '10001', '10001', '10001', '01110']],
  ['V', ['10001', '10001', '10001', '10001', '10001', '01010', '00100']],
  ['W', ['10001', '10001', '10001', '10101', '10101', '10101', '01010']],
  ['X', ['10001', '10001', '01010', '00100', '01010', '10001', '10001']],
  ['Y', ['10001', '10001', '01010', '00100', '00100', '00100', '00100']],
  ['Z', ['11111', '00001', '00010', '00100', '01000', '10000', '11111']],
]);

const FONT_WIDTH = 5;
const FONT_HEIGHT = 7;
const CHAR_SPACING = 1;
const LINE_SPACING = 2;

const createCanvas = (width: number, height: number, fill: Rgba) => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    data[offset] = fill.r;
    data[offset + 1] = fill.g;
    data[offset + 2] = fill.b;
    data[offset + 3] = fill.a;
  }
  return { width, height, data };
};

const setPixel = (canvas: { width: number; height: number; data: Uint8Array }, x: number, y: number, color: Rgba) => {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return;
  }
  const idx = (y * canvas.width + x) * 4;
  canvas.data[idx] = color.r;
  canvas.data[idx + 1] = color.g;
  canvas.data[idx + 2] = color.b;
  canvas.data[idx + 3] = color.a;
};

const drawLine = (
  canvas: { width: number; height: number; data: Uint8Array },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Rgba,
) => {
  let dx = Math.abs(x1 - x0);
  let sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    setPixel(canvas, x, y, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
};

const drawVerticalLineWithGaps = (
  canvas: { width: number; height: number; data: Uint8Array },
  x: number,
  yStart: number,
  yEnd: number,
  color: Rgba,
  gaps: Array<{ start: number; end: number }>,
) => {
  const minY = Math.min(yStart, yEnd);
  const maxY = Math.max(yStart, yEnd);
  const orderedGaps = gaps
    .filter((gap) => gap.end >= minY && gap.start <= maxY)
    .sort((a, b) => a.start - b.start);
  let gapIndex = 0;
  let currentGap = orderedGaps[gapIndex];
  for (let y = minY; y <= maxY; y++) {
    while (currentGap && y > currentGap.end) {
      gapIndex += 1;
      currentGap = orderedGaps[gapIndex];
    }
    if (currentGap && y >= currentGap.start && y <= currentGap.end) {
      continue;
    }
    setPixel(canvas, x, y, color);
  }
};

const drawRect = (
  canvas: { width: number; height: number; data: Uint8Array },
  x: number,
  y: number,
  width: number,
  height: number,
  border: Rgba,
  fill?: Rgba,
) => {
  if (fill) {
    for (let yy = y; yy < y + height; yy++) {
      for (let xx = x; xx < x + width; xx++) {
        setPixel(canvas, xx, yy, fill);
      }
    }
  }
  drawLine(canvas, x, y, x + width - 1, y, border);
  drawLine(canvas, x, y, x, y + height - 1, border);
  drawLine(canvas, x + width - 1, y, x + width - 1, y + height - 1, border);
  drawLine(canvas, x, y + height - 1, x + width - 1, y + height - 1, border);
};

const normalizeLabel = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9# ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const drawText = (
  canvas: { width: number; height: number; data: Uint8Array },
  x: number,
  y: number,
  text: string,
  color: Rgba,
) => {
  let cursorX = x;
  for (const char of text) {
    const glyph = FONT.get(char) ?? FONT.get(' ');
    if (glyph) {
      for (let row = 0; row < FONT_HEIGHT; row++) {
        const rowBits = glyph[row];
        for (let col = 0; col < FONT_WIDTH; col++) {
          if (rowBits[col] === '1') {
            setPixel(canvas, cursorX + col, y + row, color);
          }
        }
      }
    }
    cursorX += FONT_WIDTH + CHAR_SPACING;
  }
};

const measureText = (text: string) => {
  if (text.length === 0) return 0;
  return text.length * (FONT_WIDTH + CHAR_SPACING) - CHAR_SPACING;
};

type EdgePath = {
  edgeId: number;
  from: number;
  to: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  laneX: number;
};

type HorizontalSegment = {
  edgeId: number;
  y: number;
  xStart: number;
  xEnd: number;
};

type VerticalSegment = {
  edgeId: number;
  x: number;
  yStart: number;
  yEnd: number;
};

const renderDiagramPng = (
  placements: PlacementEntry[],
  edges: EdgeInfo[],
  detail: boolean,
) => {
  const margin = 20;
  const paddingX = 6;
  const paddingY = 6;
  const gapY = 14;
  const labelLines = placements.map((placement) => {
    const line1 = normalizeLabel(`${placement.name} (${placement.subcircuitId})`);
    const line2 = detail && placement.usage ? normalizeLabel(placement.usage) : null;
    return line2 ? [line1, line2] : [line1];
  });

  const maxLineLength = labelLines.reduce((max, lines) => {
    const longest = lines.reduce((innerMax, line) => Math.max(innerMax, line.length), 0);
    return Math.max(max, longest);
  }, 0);
  const textWidth = measureText('X'.repeat(Math.max(1, maxLineLength)));
  const lineHeight = FONT_HEIGHT;
  const boxTextHeight =
    labelLines[0].length * lineHeight + (labelLines[0].length - 1) * LINE_SPACING;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = boxTextHeight + paddingY * 2;
  const edgeBaseX = margin + boxWidth + 30;
  const laneWidth = 12;
  const laneCount = 6;

  const width = edgeBaseX + laneWidth * laneCount + 40;
  const height =
    margin * 2 + placements.length * boxHeight + Math.max(0, placements.length - 1) * gapY;

  const canvas = createCanvas(width, height, COLORS.background);

  const nodePositions = placements.map((_, id) => {
    const x = margin;
    const y = margin + id * (boxHeight + gapY);
    return { x, y, width: boxWidth, height: boxHeight };
  });

  nodePositions.forEach((pos, id) => {
    drawRect(canvas, pos.x, pos.y, pos.width, pos.height, COLORS.border, COLORS.boxFill);
    const lines = labelLines[id];
    const textStartY =
      pos.y + paddingY + Math.max(0, (pos.height - paddingY * 2 - boxTextHeight) / 2);
    lines.forEach((line, idx) => {
      const normalized = normalizeLabel(line);
      const lineWidth = measureText(normalized);
      const textX = pos.x + paddingX + Math.max(0, (pos.width - paddingX * 2 - lineWidth) / 2);
      const textY = textStartY + idx * (lineHeight + LINE_SPACING);
      drawText(canvas, textX, textY, normalized, COLORS.text);
    });
  });

  const edgePaths: EdgePath[] = [];
  edges.forEach((edge, edgeId) => {
    const from = nodePositions[edge.from];
    const to = nodePositions[edge.to];
    if (!from || !to) return;
    const laneIndex = (edge.from * 31 + edge.to * 17) % laneCount;
    const laneX = edgeBaseX + laneIndex * laneWidth;
    const y1 = Math.round(from.y + from.height / 2);
    const y2 = Math.round(to.y + to.height / 2);
    const x1 = from.x + from.width;
    const x2 = to.x;
    edgePaths.push({ edgeId, from: edge.from, to: edge.to, laneX, x1, y1, x2, y2 });
  });

  const horizontalSegments: HorizontalSegment[] = [];
  const verticalSegments: VerticalSegment[] = [];

  edgePaths.forEach((path) => {
    if (path.y1 === path.y2) {
      horizontalSegments.push({
        edgeId: path.edgeId,
        y: path.y1,
        xStart: Math.min(path.x1, path.x2),
        xEnd: Math.max(path.x1, path.x2),
      });
      return;
    }
    horizontalSegments.push({
      edgeId: path.edgeId,
      y: path.y1,
      xStart: Math.min(path.x1, path.laneX),
      xEnd: Math.max(path.x1, path.laneX),
    });
    horizontalSegments.push({
      edgeId: path.edgeId,
      y: path.y2,
      xStart: Math.min(path.x2, path.laneX),
      xEnd: Math.max(path.x2, path.laneX),
    });
    verticalSegments.push({
      edgeId: path.edgeId,
      x: path.laneX,
      yStart: path.y1,
      yEnd: path.y2,
    });
  });

  horizontalSegments.forEach((seg) => {
    drawLine(canvas, seg.xStart, seg.y, seg.xEnd, seg.y, COLORS.edge);
  });

  const gapRadius = 3;
  verticalSegments.forEach((seg) => {
    const gaps: Array<{ start: number; end: number }> = [];
    const minY = Math.min(seg.yStart, seg.yEnd);
    const maxY = Math.max(seg.yStart, seg.yEnd);
    for (const hSeg of horizontalSegments) {
      if (hSeg.edgeId === seg.edgeId && (hSeg.y === seg.yStart || hSeg.y === seg.yEnd)) {
        continue;
      }
      if (hSeg.y < minY || hSeg.y > maxY) continue;
      if (hSeg.xStart <= seg.x && seg.x <= hSeg.xEnd) {
        gaps.push({ start: hSeg.y - gapRadius, end: hSeg.y + gapRadius });
      }
    }
    drawVerticalLineWithGaps(canvas, seg.x, seg.yStart, seg.yEnd, COLORS.edge, gaps);
  });

  edgePaths.forEach((path) => {
    const arrowSize = 4;
    drawLine(canvas, path.x2, path.y2, path.x2 + arrowSize, path.y2 - arrowSize, COLORS.edge);
    drawLine(canvas, path.x2, path.y2, path.x2 + arrowSize, path.y2 + arrowSize, COLORS.edge);
  });

  return canvas;
};

const encodePng = (width: number, height: number, rgba: Uint8Array) => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const rgbaBuffer = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    const srcStart = y * width * 4;
    rgbaBuffer.copy(raw, rowStart + 1, srcStart, srcStart + width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 6 });

  const chunks = [
    createChunk('IHDR', ihdr),
    createChunk('IDAT', idat),
    createChunk('IEND', Buffer.alloc(0)),
  ];
  return Buffer.concat([signature, ...chunks]);
};

const createChunk = (type: string, data: Buffer) => {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  const crcValue = crc32(Buffer.concat([typeBuffer, data]));
  crc.writeUInt32BE(crcValue >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
};

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const byte of buf) {
    c = crc32Table[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const renderSvgToPng = (svg: string, scale: number) => {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: scale },
  });
  return resvg.render().asPng();
};

const toSegment = (x1: number, y1: number, x2: number, y2: number): Segment2D | null => {
  if (x1 === x2 && y1 === y2) {
    return null;
  }
  return {
    x1,
    y1,
    x2,
    y2,
    minX: Math.min(x1, x2),
    maxX: Math.max(x1, x2),
    minY: Math.min(y1, y2),
    maxY: Math.max(y1, y2),
  };
};

const segmentsBBoxOverlap = (a: Segment2D, b: Segment2D) => (
  a.minX <= b.maxX &&
  a.maxX >= b.minX &&
  a.minY <= b.maxY &&
  a.maxY >= b.minY
);

const pointsEqual = (ax: number, ay: number, bx: number, by: number) =>
  Math.abs(ax - bx) < 1e-6 && Math.abs(ay - by) < 1e-6;

const orientation = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
  const val = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(val) < 1e-6) return 0;
  return val > 0 ? 1 : 2;
};

const onSegment = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (
  Math.min(ax, cx) - 1e-6 <= bx && bx <= Math.max(ax, cx) + 1e-6 &&
  Math.min(ay, cy) - 1e-6 <= by && by <= Math.max(ay, cy) + 1e-6
);

const segmentsIntersect = (a: Segment2D, b: Segment2D) => {
  if (!segmentsBBoxOverlap(a, b)) return false;
  if (
    pointsEqual(a.x1, a.y1, b.x1, b.y1) ||
    pointsEqual(a.x1, a.y1, b.x2, b.y2) ||
    pointsEqual(a.x2, a.y2, b.x1, b.y1) ||
    pointsEqual(a.x2, a.y2, b.x2, b.y2)
  ) {
    return false;
  }
  const o1 = orientation(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const o2 = orientation(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const o3 = orientation(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const o4 = orientation(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a.x1, a.y1, b.x1, b.y1, a.x2, a.y2)) return true;
  if (o2 === 0 && onSegment(a.x1, a.y1, b.x2, b.y2, a.x2, a.y2)) return true;
  if (o3 === 0 && onSegment(b.x1, b.y1, a.x1, a.y1, b.x2, b.y2)) return true;
  if (o4 === 0 && onSegment(b.x1, b.y1, a.x2, a.y2, b.x2, b.y2)) return true;
  return false;
};

const edgeSegmentsFromLayout = (edge: ElkEdge): Segment2D[] => {
  const segments: Segment2D[] = [];
  (edge.sections ?? []).forEach((section) => {
    const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      const seg = toSegment(start.x, start.y, end.x, end.y);
      if (seg) {
        segments.push(seg);
      }
    }
  });
  return segments;
};

const computeEdgeLength = (segments: Segment2D[]) =>
  segments.reduce((total, seg) => total + Math.abs(seg.x2 - seg.x1) + Math.abs(seg.y2 - seg.y1), 0);

const getEdgeEndpoints = (edge: ElkEdge) => {
  const source = edge.sources?.[0];
  const target = edge.targets?.[0];
  if (!source || !target) {
    return null;
  }
  return { source, target };
};

const assignLayersFor3d = (
  layout: ElkNode,
  longEdgeThreshold: number,
  edgeEndpointsById: Map<string, { source: string; target: string }>,
  towerMode: boolean,
) => {
  const edges = layout.edges ?? [];
  const layerSegments: Segment2D[][] = [];
  const edgeLayer = new Map<string, number>();
  const edgeSegmentsCache = new Map<string, Segment2D[]>();

  const getSegments = (edge: ElkEdge) => {
    const cached = edgeSegmentsCache.get(edge.id);
    if (cached) return cached;
    const segments = edgeSegmentsFromLayout(edge);
    edgeSegmentsCache.set(edge.id, segments);
    return segments;
  };

  if (towerMode) {
    const nodes = layout.children ?? [];
    const nodeOrder = [...nodes].sort((a, b) => {
      const ay = a.y ?? 0;
      const by = b.y ?? 0;
      if (ay !== by) return ay - by;
      const ax = a.x ?? 0;
      const bx = b.x ?? 0;
      return ax - bx;
    });
    const nodeLayer = new Map<string, number>();
    nodeOrder.forEach((node, idx) => {
      nodeLayer.set(node.id, idx);
    });
    edges.forEach((edge) => {
      const endpoints = edgeEndpointsById.get(edge.id) ?? getEdgeEndpoints(edge);
      if (!endpoints) {
        edgeLayer.set(edge.id, 0);
        return;
      }
      const sourceLayer = nodeLayer.get(endpoints.source) ?? 0;
      const targetLayer = nodeLayer.get(endpoints.target) ?? 0;
      edgeLayer.set(edge.id, Math.max(sourceLayer, targetLayer));
    });
    return {
      nodeLayer,
      edgeLayer,
      maxLayer: Math.max(0, (layout.children?.length ?? 1) - 1),
    };
  }

  edges.forEach((edge) => {
    const segments = getSegments(edge);
    const edgeLength = computeEdgeLength(segments);
    const baseLayer = longEdgeThreshold > 0 ? Math.floor(edgeLength / longEdgeThreshold) : 0;
    let assigned = false;
    for (let layer = baseLayer; layer < layerSegments.length; layer++) {
      const existing = layerSegments[layer];
      let intersects = false;
      for (const seg of segments) {
        for (const other of existing) {
          if (segmentsIntersect(seg, other)) {
            intersects = true;
            break;
          }
        }
        if (intersects) break;
      }
      if (!intersects) {
        edgeLayer.set(edge.id, layer);
        existing.push(...segments);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      const newLayerIndex = Math.max(baseLayer, layerSegments.length);
      edgeLayer.set(edge.id, newLayerIndex);
      while (layerSegments.length <= newLayerIndex) {
        layerSegments.push([]);
      }
      layerSegments[newLayerIndex].push(...segments);
    }
  });

  const nodeLayer = new Map<string, number>();
  const nodes = layout.children ?? [];
  nodes.forEach((node) => {
    const nodeId = node.id;
    let layer = 0;
    edges.forEach((edge) => {
      const endpoints = edgeEndpointsById.get(edge.id) ?? getEdgeEndpoints(edge);
      if (!endpoints) return;
      if (endpoints.source === nodeId || endpoints.target === nodeId) {
        layer = Math.max(layer, edgeLayer.get(edge.id) ?? 0);
      }
    });
    nodeLayer.set(nodeId, layer);
  });

  const maxNodeLayer = Math.max(0, ...Array.from(nodeLayer.values(), v => v));
  const maxEdgeLayer = Math.max(0, ...Array.from(edgeLayer.values(), v => v));
  return { nodeLayer, edgeLayer, maxLayer: Math.max(maxNodeLayer, maxEdgeLayer) };
};

type ThreeImportMap = {
  threeModule: string;
  threeBase: string;
};

const renderElk3dHtml = (
  layout: ElkNode,
  labelById: Map<string, string[]>,
  portMetaById: Map<string, PortMeta>,
  importMap: ThreeImportMap,
  nodeLayers: Map<string, number>,
  edgeLayers: Map<string, number>,
  edgeEndpointsById: Map<string, { source: string; target: string }>,
  towerMode: boolean,
  maxLayer: number,
  layerSpacing: number,
) => {
  const nodes = (layout.children ?? []).map((node) => ({
    id: node.id,
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? 120,
    height: node.height ?? 60,
    layer: nodeLayers.get(node.id) ?? 0,
    label: (labelById.get(node.id) ?? [node.id]).join('\n'),
  }));
  const connectedPorts = new Set<string>();
  const edges = (layout.edges ?? []).map((edge) => {
    const endpoints = edgeEndpointsById.get(edge.id);
    const sourcePort = edge.sources?.[0] ?? null;
    const targetPort = edge.targets?.[0] ?? null;
    (edge.sources ?? []).forEach((portId) => connectedPorts.add(portId));
    (edge.targets ?? []).forEach((portId) => connectedPorts.add(portId));
    return ({
      id: edge.id,
      layer: edgeLayers.get(edge.id) ?? 0,
      source: endpoints?.source ?? edge.sources?.[0] ?? null,
      target: endpoints?.target ?? edge.targets?.[0] ?? null,
      sourcePort,
      targetPort,
      sections: (edge.sections ?? []).map((section) => ({
        startPoint: section.startPoint,
        endPoint: section.endPoint,
        bendPoints: section.bendPoints ?? [],
      })),
    });
  });
  const ports = (layout.children ?? []).flatMap((node) =>
    (node.ports ?? []).map((port) => {
      const meta = portMetaById.get(port.id);
      const relX = (port.x ?? 0) + (port.width ?? PORT_SIZE) / 2;
      const relY = (port.y ?? 0) + (port.height ?? PORT_SIZE) / 2;
      return {
        id: port.id,
        nodeId: node.id,
        side: meta?.side ?? 'NORTH',
        label: meta?.label ?? null,
        labelTier: meta?.labelTier ?? 0,
        layer: nodeLayers.get(node.id) ?? 0,
        x: (node.x ?? 0) + relX,
        y: (node.y ?? 0) + relY,
        relX,
        relY,
      };
    }),
  );

  const data = {
    nodes,
    edges,
    ports,
    connectedPorts: Array.from(connectedPorts),
    meta: {
      margin: ELK_STYLE.margin,
      maxLayer,
      layerSpacing,
      tower: towerMode,
    },
  };

  const json = JSON.stringify(data);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>3D Circuit Diagram</title>
    <script type="importmap">
      ${JSON.stringify({
        imports: {
          three: importMap.threeModule,
          "three/": importMap.threeBase,
        },
      })}
    </script>
    <style>
      html, body { margin: 0; height: 100%; background: #101316; color: #e7e7e7; }
      #canvas { width: 100%; height: 100%; display: block; }
      #hud {
        position: absolute;
        top: 12px;
        left: 12px;
        background: rgba(20, 20, 20, 0.8);
        padding: 10px 12px;
        border-radius: 6px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        line-height: 1.4;
      }
      #hud input {
        width: 220px;
        background: #1c2127;
        color: #e7e7e7;
        border: 1px solid #2d333b;
        padding: 4px 6px;
        border-radius: 4px;
      }
    </style>
  </head>
  <body>
    <div id="hud">
      <div><strong>Controls</strong></div>
      <div>Drag to rotate, scroll to zoom</div>
      <div style="margin-top:6px;">Search: <input id="search" placeholder="node name..." /></div>
      <div style="margin-top:6px;">Nodes: ${nodes.length}, Edges: ${edges.length}</div>
      <div style="margin-top:4px;">Layers: ${maxLayer + 1}</div>
    </div>
    <canvas id="canvas"></canvas>
    <script type="module">
      const data = ${json};
      const hud = document.getElementById('hud');

      const showError = (message) => {
        const errorBox = document.createElement('div');
        errorBox.style.marginTop = '8px';
        errorBox.style.padding = '8px';
        errorBox.style.background = 'rgba(180,40,40,0.85)';
        errorBox.style.borderRadius = '4px';
        errorBox.textContent = message;
        hud.appendChild(errorBox);
      };

      const hasWebGL = () => {
        try {
          const canvas = document.createElement('canvas');
          return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch {
          return false;
        }
      };

      if (!hasWebGL()) {
        showError('WebGL is not available in this browser/environment.');
      }

      (async () => {
        try {
          const THREE = await import('three');
          const controlsModule = await import('three/examples/jsm/controls/OrbitControls.js');
          const OrbitControls = controlsModule.OrbitControls;
          const canvas = document.getElementById('canvas');
          const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
          renderer.setPixelRatio(window.devicePixelRatio || 1);
          renderer.setSize(window.innerWidth, window.innerHeight);

          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x101316);

          const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 100000);
          camera.position.set(0, -800, 800);

          const controls = new OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;

          const ambient = new THREE.AmbientLight(0xffffff, 0.7);
          scene.add(ambient);
          const directional = new THREE.DirectionalLight(0xffffff, 0.6);
          directional.position.set(300, -200, 500);
          scene.add(directional);

          const nodeMaterial = new THREE.MeshStandardMaterial({ color: 0x2f80ed, roughness: 0.5, metalness: 0.1 });
          const nodeHoverMaterial = new THREE.MeshStandardMaterial({ color: 0xf2994a, roughness: 0.4, metalness: 0.1 });
          const portMaterial = new THREE.MeshStandardMaterial({ color: 0x9b51e0, roughness: 0.6 });
          const lineMaterial = new THREE.LineBasicMaterial({ color: 0xb0b6bf });

          const group = new THREE.Group();
          scene.add(group);

          const nodeMeshes = new Map();

          const addLabelSprite = (text, position, scale = 1) => {
            const labelCanvas = document.createElement('canvas');
            const ctx = labelCanvas.getContext('2d');
            const lines = text.split('\\n');
            const fontSize = 18;
            const padding = 12;
            ctx.font = \`\${fontSize}px monospace\`;
            const width = Math.max(...lines.map(line => ctx.measureText(line).width)) + padding * 2;
            const height = lines.length * (fontSize + 4) + padding * 2;
            labelCanvas.width = width;
            labelCanvas.height = height;
            ctx.font = \`\${fontSize}px monospace\`;
            ctx.fillStyle = 'rgba(15,16,18,0.85)';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#e7e7e7';
            lines.forEach((line, idx) => {
              ctx.fillText(line, padding, padding + fontSize + idx * (fontSize + 4));
            });
            const texture = new THREE.CanvasTexture(labelCanvas);
            const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
            const sprite = new THREE.Sprite(material);
            sprite.scale.set(width * 0.6 * scale, height * 0.6 * scale, 1);
            sprite.position.copy(position);
            group.add(sprite);
          };

          if (!data.nodes || data.nodes.length === 0) {
            showError('No nodes were found in the layout data.');
          }

          const nodeById = new Map();
          const layerSpacing = data.meta.layerSpacing || 40;
          const layerOffset = (data.meta.maxLayer || 0) / 2;
          const towerMode = data.meta.tower === true;
          const towerCenterX = 0;
          const towerCenterY = 0;
          data.nodes.forEach((node) => {
            const width = node.width;
            const height = node.height;
            const depth = 14;
            const geometry = new THREE.BoxGeometry(width, height, depth);
            const mesh = new THREE.Mesh(geometry, nodeMaterial.clone());
            const centerX = towerMode ? towerCenterX : node.x + width / 2;
            const centerY = towerMode ? towerCenterY : -(node.y + height / 2);
            const centerZ = (node.layer - layerOffset) * layerSpacing;
            mesh.position.set(centerX, centerY, centerZ);
            group.add(mesh);
            nodeMeshes.set(node.id, mesh);
            nodeById.set(node.id, { ...node, centerX, centerY, centerZ });
            addLabelSprite(node.label, new THREE.Vector3(centerX, centerY, centerZ + depth / 2 + 18), 0.8);
          });

          const connectedPortSet = new Set(data.connectedPorts || []);
          const portGeometry = new THREE.SphereGeometry(4, 12, 12);
          const portById = new Map();
          data.ports.forEach((port) => {
            const nodeInfo = nodeById.get(port.nodeId);
            const nodeWidth = nodeInfo ? nodeInfo.width : 0;
            const nodeHeight = nodeInfo ? nodeInfo.height : 0;
            const nodeTopLeftX = (nodeInfo ? nodeInfo.centerX : 0) - nodeWidth / 2;
            const nodeTopLeftY = (nodeInfo ? nodeInfo.centerY : 0) - nodeHeight / 2;
            const x = towerMode ? nodeTopLeftX + (port.relX ?? 0) : port.x;
            const y = towerMode ? nodeTopLeftY + (port.relY ?? 0) : -port.y;
            const baseZ = nodeInfo ? nodeInfo.centerZ : 0;
            const z = baseZ + (port.side === 'NORTH' ? 10 : -10);
            const mesh = new THREE.Mesh(portGeometry, portMaterial);
            mesh.position.set(x, y, z);
            group.add(mesh);
            portById.set(port.id, { x, y, z, nodeId: port.nodeId });
            if (!connectedPortSet.has(port.id)) {
              const stubLength = 28;
              const stubEndZ = z + (port.side === 'NORTH' ? stubLength : -stubLength);
              const stubGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(x, y, z),
                new THREE.Vector3(x, y, stubEndZ),
              ]);
              const stubLine = new THREE.Line(stubGeometry, lineMaterial);
              group.add(stubLine);
            }
            if (port.label) {
              const tierOffset = port.labelTier ? port.labelTier * 12 : 0;
              const labelOffset = port.side === 'NORTH' ? 20 + tierOffset : -20 - tierOffset;
              addLabelSprite(port.label, new THREE.Vector3(x, y, z + labelOffset), 0.6);
            }
          });

          data.edges.forEach((edge) => {
            const z = (edge.layer - layerOffset) * layerSpacing;
            const sourceNode = edge.source ? nodeById.get(edge.source) : null;
            const targetNode = edge.target ? nodeById.get(edge.target) : null;
            const sourceZ = sourceNode ? sourceNode.centerZ : 0;
            const targetZ = targetNode ? targetNode.centerZ : 0;
            if (towerMode && edge.sourcePort && edge.targetPort) {
              const src = portById.get(edge.sourcePort);
              const dst = portById.get(edge.targetPort);
              if (!src || !dst) {
                return;
              }
              const points = [
                new THREE.Vector3(src.x, src.y, src.z),
                new THREE.Vector3(src.x, src.y, z),
                new THREE.Vector3(dst.x, dst.y, z),
                new THREE.Vector3(dst.x, dst.y, dst.z),
              ];
              const geometry = new THREE.BufferGeometry().setFromPoints(points);
              const line = new THREE.Line(geometry, lineMaterial);
              group.add(line);
              return;
            }
            edge.sections.forEach((section) => {
              const basePoints = [section.startPoint, ...(section.bendPoints || []), section.endPoint];
              if (basePoints.length < 2) {
                return;
              }
              const start = basePoints[0];
              const end = basePoints[basePoints.length - 1];
              const points = [
                new THREE.Vector3(start.x, -start.y, sourceZ),
                new THREE.Vector3(start.x, -start.y, z),
                ...basePoints.map(pt => new THREE.Vector3(pt.x, -pt.y, z)),
                new THREE.Vector3(end.x, -end.y, z),
                new THREE.Vector3(end.x, -end.y, targetZ),
              ];
              const geometry = new THREE.BufferGeometry().setFromPoints(points);
              const line = new THREE.Line(geometry, lineMaterial);
              group.add(line);
            });
          });

          const bounds = new THREE.Box3().setFromObject(group);
          const size = bounds.getSize(new THREE.Vector3());
          const center = bounds.getCenter(new THREE.Vector3());
          controls.target.copy(center);
          camera.position.set(center.x, center.y - size.y * 1.2, size.z + size.x * 1.1);
          camera.lookAt(center);

          window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
          });

          const search = document.getElementById('search');
          search.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            nodeMeshes.forEach((mesh, id) => {
              const node = data.nodes.find(n => n.id === id);
              const match = query && node && node.label.toLowerCase().includes(query);
              mesh.material = match ? nodeHoverMaterial : nodeMaterial;
            });
          });

          const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
          };
          animate();
        } catch (err) {
          const message = err && err.message ? err.message : String(err);
          showError(\`Failed to initialize Three.js: \${message}\`);
          console.error(err);
        }
      })();
    </script>
  </body>
</html>
`;
};

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const resolveThreeImportMap = async (): Promise<ThreeImportMap> => {
  const localThreeModule = path.resolve(packageRoot, 'node_modules', 'three', 'build', 'three.module.js');
  if (await fileExists(localThreeModule)) {
    return {
      threeModule: '/node_modules/three/build/three.module.js',
      threeBase: '/node_modules/three/',
    };
  }
  const cdnBase = 'https://unpkg.com/three@0.161.0/';
  return {
    threeModule: `${cdnBase}build/three.module.js`,
    threeBase: cdnBase,
  };
};

const findMermaidCli = async () => {
  const repoRoot = path.resolve(packageRoot, '..', '..', '..');
  const candidates = [
    path.resolve(packageRoot, 'node_modules', '.bin', 'mmdc'),
    path.resolve(repoRoot, 'node_modules', '.bin', 'mmdc'),
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
};

const runCommand = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
      }
    });
  });

const main = async () => {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    return;
  }

  const inputPath = path.resolve(process.cwd(), args.input ?? DEFAULT_INPUT);
  const format = normalizeFormat(args.format);
  const detail = Boolean(args.detail);
  const scaleRaw = args.scale ?? '2';
  const scale = Number(scaleRaw);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('Scale must be a positive number.');
  }
  const maxDimRaw = args['max-dim'] ?? args.maxDim ?? '12000';
  const maxDim = Number(maxDimRaw);
  if (!Number.isFinite(maxDim) || maxDim < 0) {
    throw new Error('max-dim must be a non-negative number.');
  }
  const layerSpacingRaw = args['layer-spacing'] ?? args.layerSpacing ?? '40';
  const layerSpacing = Number(layerSpacingRaw);
  if (!Number.isFinite(layerSpacing) || layerSpacing <= 0) {
    throw new Error('layer-spacing must be a positive number.');
  }
  const longEdgeRaw = args['long-edge'] ?? args.longEdge ?? '400';
  const longEdgeThreshold = Number(longEdgeRaw);
  if (!Number.isFinite(longEdgeThreshold) || longEdgeThreshold < 0) {
    throw new Error('long-edge must be a non-negative number.');
  }
  const towerMode = format === '3d'
    ? (args.tower === undefined ? false : Boolean(args.tower))
    : false;
  const defaultOutput = format === '3d'
    ? path.resolve(packageRoot, 'outputs', 'analysis', 'circuit_diagram_3d.html')
    : path.resolve(packageRoot, 'outputs', 'analysis', 'circuit_diagram.png');
  const resolvedOutputBase = args.output
    ? path.resolve(process.cwd(), args.output)
    : defaultOutput;
  const outputPath = format === '3d'
    ? (path.extname(resolvedOutputBase) === '.html' ? resolvedOutputBase : `${resolvedOutputBase}.html`)
    : (path.extname(resolvedOutputBase) === '.png' ? resolvedOutputBase : `${resolvedOutputBase}.png`);

  const placements = await readPlacements(inputPath);
  const { edges, externalInCounts, warnings } = buildEdges(placements);
  const edgeList = Array.from(edges.values());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  let diagramCanvas: { width: number; height: number; data: Uint8Array } | null = null;
  if (format === 'elk' || format === '3d') {
    const { graph, labelById, portMetaById, edgeEndpointsById } = buildElkGraph(
      placements,
      edgeList,
      externalInCounts,
      detail,
    );
    try {
      const elk = new ELK();
      const layout = await elk.layout(graph);
      if (format === '3d') {
        const { nodeLayer, edgeLayer, maxLayer } = assignLayersFor3d(
          layout,
          longEdgeThreshold,
          edgeEndpointsById,
          towerMode,
        );
        const importMap = await resolveThreeImportMap();
        const html = renderElk3dHtml(
          layout,
          labelById,
          portMetaById,
          importMap,
          nodeLayer,
          edgeLayer,
          edgeEndpointsById,
          towerMode,
          maxLayer,
          layerSpacing,
        );
        await fs.writeFile(outputPath, html, 'utf8');
        console.log(`Wrote diagram to ${outputPath}`);
        if (warnings.length > 0) {
          for (const warning of warnings) {
            console.warn(`Warning: ${warning}`);
          }
        }
        return;
      }
      const svg = renderElkSvg(layout, labelById, portMetaById);
      let effectiveScale = scale;
      if (maxDim > 0) {
        const layoutWidth = layout.width ?? 0;
        const layoutHeight = layout.height ?? 0;
        const layoutMax = Math.max(layoutWidth, layoutHeight);
        if (layoutMax > 0) {
          const clampScale = maxDim / layoutMax;
          if (clampScale < effectiveScale) {
            effectiveScale = clampScale;
          }
        }
      }
      const png = renderSvgToPng(svg, effectiveScale);
      await fs.writeFile(outputPath, png);
      console.log(`Wrote diagram to ${outputPath}`);
      if (warnings.length > 0) {
        for (const warning of warnings) {
          console.warn(`Warning: ${warning}`);
        }
      }
      return;
    } catch (err) {
      console.warn(
        `Warning: ELK render failed; falling back to builtin renderer. ${(err as Error).message}`,
      );
    }
    if (format === '3d') {
      throw new Error('ELK layout failed; cannot generate 3D HTML fallback.');
    }
    diagramCanvas = renderDiagramPng(placements, edgeList, detail);
  } else if (format === 'mermaid') {
    const mermaidSource = renderMermaidSource(placements, edgeList, externalInCounts, detail);
    const mmdcPath = await findMermaidCli();
    if (mmdcPath) {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'circuit-mermaid-'));
      const inputMmd = path.join(tempDir, 'circuit_diagram.mmd');
      await fs.writeFile(inputMmd, mermaidSource, 'utf8');
      try {
        await runCommand(mmdcPath, ['-i', inputMmd, '-o', outputPath]);
        console.log(`Wrote diagram to ${outputPath}`);
        if (warnings.length > 0) {
          for (const warning of warnings) {
            console.warn(`Warning: ${warning}`);
          }
        }
        return;
      } catch (err) {
        console.warn(
          `Warning: Mermaid CLI failed; falling back to builtin renderer. ${(err as Error).message}`,
        );
      }
    } else {
      console.warn('Warning: Mermaid CLI (mmdc) not found; falling back to builtin renderer.');
    }
    diagramCanvas = renderDiagramPng(placements, edgeList, detail);
  } else if (format === 'builtin') {
    diagramCanvas = renderDiagramPng(placements, edgeList, detail);
  } else {
    const text = renderAscii(placements, edgeList, externalInCounts, detail).trimEnd();
    const lines = text.split('\n');
    const width =
      Math.max(...lines.map((line) => measureText(normalizeLabel(line))), 1) + 20;
    const height =
      lines.length * FONT_HEIGHT + Math.max(0, lines.length - 1) * LINE_SPACING + 20;
    const canvas = createCanvas(width, height, COLORS.background);
    lines.forEach((line, idx) => {
      const normalized = normalizeLabel(line);
      const x = 10;
      const y = 10 + idx * (FONT_HEIGHT + LINE_SPACING);
      drawText(canvas, x, y, normalized, COLORS.text);
    });
    diagramCanvas = canvas;
  }

  const png = encodePng(diagramCanvas.width, diagramCanvas.height, diagramCanvas.data);
  await fs.writeFile(outputPath, png);
  console.log(`Wrote diagram to ${outputPath}`);

  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.warn(`Warning: ${warning}`);
    }
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
