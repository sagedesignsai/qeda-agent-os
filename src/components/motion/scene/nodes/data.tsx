import { Text } from '@react-three/drei';
import { useMemo } from 'react';

import type { MotionNode } from '@/lib/motion/types';

import { getMotionAnimatedPropApplier, registerMotionAnimatedPropApplier } from '../animated-props';
import { layoutBars, layoutLinePoints } from '@/lib/motion/chart-layout';
import { numberProp, stringProp } from './helpers';

const NUM = "0123456789.,%$€£+−kM×";

export function KpiRenderer({ node }: { node: MotionNode }) {
  const value = numberProp(node, 'value', 0);
  const label = stringProp(node, 'label', 'Metric');
  const prefix = stringProp(node, 'prefix', '');
  const suffix = stringProp(node, 'suffix', '');
  const delta = numberProp(node, 'delta', 0);
  const deltaLabel = stringProp(node, 'deltaLabel', '');
  const valueSize = numberProp(node, 'valueSize', 0.5);
  const color = stringProp(node, 'color', '#ffffff');
  const accent = stringProp(node, 'accentColor', '#59c7a6');
  const opacity = numberProp(node, 'opacity', 1);
  return (
    <group>
      <Text fontSize={valueSize} color={color} anchorX="center" anchorY="middle" position={[0, 0.15, 0]} characters={NUM} userData={{ motionRole: 'value' }}>
        {`${prefix}${value.toLocaleString()}${suffix}`}
      </Text>
      <Text fontSize={valueSize * 0.32} color="#9fb0c9" anchorX="center" anchorY="middle" position={[0, -0.25, 0]} characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/">
        {label}
      </Text>
      {deltaLabel && (
        <Text fontSize={valueSize * 0.26} color={accent} anchorX="center" anchorY="middle" position={[0, -0.42, 0]} characters={NUM}>
          {deltaLabel || `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`}
        </Text>
      )}
    </group>
  );
}

// applier: update value text when rounded value changes
registerMotionAnimatedPropApplier('data.kpi', (group, node) => {
  const value = numberProp(node, 'value', 0);
  const prefix = stringProp(node, 'prefix', '');
  const suffix = stringProp(node, 'suffix', '');
  const mesh = group.children.find((c: any) => c.userData?.motionRole === 'value') as any;
  if (mesh) mesh.text = `${prefix}${value.toLocaleString()}${suffix}`;
});

export function ProgressBarRenderer({ node }: { node: MotionNode }) {
  const progress = numberProp(node, 'progress', 0.64);
  const label = stringProp(node, 'label', '');
  const valueLabel = stringProp(node, 'valueLabel', '');
  const width = numberProp(node, 'width', 3.2);
  const height = numberProp(node, 'height', 0.18);
  const color = stringProp(node, 'color', '#5885f7');
  const track = stringProp(node, 'trackColor', '#1b2230');
  const radius = numberProp(node, 'cornerRadius', 0.09);
  const opacity = numberProp(node, 'opacity', 1);
  return (
    <group>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={track} transparent opacity={opacity * 0.5} toneMapped={false} />
      </mesh>
      <mesh position={[-width / 2 + (width * progress) / 2, 0, 0.001]} userData={{ motionRole: 'fill' }}>
        <planeGeometry args={[Math.max(0.001, width * progress), height]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      {label && <Text fontSize={height * 0.7} color="#9fb0c9" anchorX="left" anchorY="middle" position={[-width / 2, height + 0.12, 0]} characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/">{label}</Text>}
      {valueLabel && <Text fontSize={height * 0.7} color="#ffffff" anchorX="right" anchorY="middle" position={[width / 2, height + 0.12, 0]} characters={NUM}>{valueLabel}</Text>}
    </group>
  );
}

registerMotionAnimatedPropApplier('data.progress-bar', (group, node) => {
  const progress = numberProp(node, 'progress', 0.64);
  const width = numberProp(node, 'width', 3.2);
  const height = numberProp(node, 'height', 0.18);
  const fill = group.children.find((c: any) => c.userData?.motionRole === 'fill') as any;
  if (fill) {
    fill.position.x = -width / 2 + (width * progress) / 2;
    fill.scale.x = Math.max(0.001, progress);
  }
});

export function BarChartRenderer({ node }: { node: MotionNode }) {
  const values = (node.props.values as number[]) ?? [];
  const width = numberProp(node, 'width', 4);
  const height = numberProp(node, 'height', 2);
  const gap = numberProp(node, 'gap', 0.15);
  const color = stringProp(node, 'color', '#5885f7');
  const opacity = numberProp(node, 'opacity', 1);
  const progress = numberProp(node, 'progress', 1);
  const showValues = !!node.props.showValues;
  const bars = layoutBars(values, width, height, gap, progress);
  return (
    <group userData={{ motionRole: 'bars' }}>
      {bars.map((b, i) => (
        <group key={i}>
          <mesh position={[b.x, b.y, 0]} userData={{ motionRole: 'bar', motionPartIndex: i }}>
            <boxGeometry args={[b.width, Math.max(0.001, b.height), 0.05]} />
            <meshStandardMaterial color={color} transparent opacity={opacity} />
          </mesh>
          {showValues && (
            <Text fontSize={0.1} color="#9fb0c9" anchorX="center" anchorY="bottom" position={[b.x, b.y + b.height / 2 + 0.05, 0]} characters={NUM}>
              {String(values[i] ?? '')}
            </Text>
          )}
        </group>
      ))}
    </group>
  );
}

registerMotionAnimatedPropApplier('data.bar-chart', (group, node) => {
  const values = (node.props.values as number[]) ?? [];
  const width = numberProp(node, 'width', 4);
  const height = numberProp(node, 'height', 2);
  const gap = numberProp(node, 'gap', 0.15);
  const progress = numberProp(node, 'progress', 1);
  const bars = layoutBars(values, width, height, gap, progress);
  // bars are nested one level under the root group
  const root = group.children[0] as any;
  const barGroups = root ? root.children : group.children;
  bars.forEach((b, i) => {
    const g = barGroups[i];
    if (!g) return;
    const mesh = g.children?.[0] ?? g;
    if (mesh) {
      mesh.position.set(b.x, b.y, 0);
      mesh.scale.y = Math.max(0.001, b.height / Math.max(0.001, (Math.abs(values[i] ?? 1) / Math.max(1, ...values.map((v) => Math.abs(v || 0)))) * height || 0.001));
    }
  });
});

export function LineChartRenderer({ node }: { node: MotionNode }) {
  const values = (node.props.values as number[]) ?? [];
  const width = numberProp(node, 'width', 4);
  const height = numberProp(node, 'height', 1.8);
  const color = stringProp(node, 'color', '#5885f7');
  const lineWidth = numberProp(node, 'lineWidth', 0.04);
  const fill = !!node.props.fill;
  const fillOpacity = numberProp(node, 'fillOpacity', 0.18);
  const showGrid = !!node.props.showGrid;
  const gridColor = stringProp(node, 'gridColor', '#1b2230');
  const opacity = numberProp(node, 'opacity', 1);
  const progress = numberProp(node, 'progress', 1);
  const pts = layoutLinePoints(values, width, height);
  const visibleCount = Math.max(2, Math.floor(pts.length * progress));
  const visiblePts = pts.slice(0, visibleCount);
  return (
    <group>
      {showGrid && (
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial color={gridColor} transparent opacity={0.4} toneMapped={false} />
        </mesh>
      )}
      {visiblePts.map((p, i) => i > 0 && (
        <mesh key={i} position={[(visiblePts[i-1].x + p.x) / 2, (visiblePts[i-1].y + p.y) / 2, 0]} rotation={[0, 0, Math.atan2(p.y - visiblePts[i-1].y, p.x - visiblePts[i-1].x)]}>
          <boxGeometry args={[Math.hypot(p.x - visiblePts[i-1].x, p.y - visiblePts[i-1].y), lineWidth, 0.01]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
        </mesh>
      ))}
      {fill && visiblePts.length >= 2 && (
        <mesh position={[0, -height / 2, -0.005]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial color={color} transparent opacity={fillOpacity * opacity * progress} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export function DonutChartRenderer({ node }: { node: MotionNode }) {
  const segments = (node.props.segments as Array<{ value: number; color: string; label?: string }>) ?? [];
  const radius = numberProp(node, 'radius', 1);
  const thickness = numberProp(node, 'thickness', 0.22);
  const centerLabel = stringProp(node, 'centerLabel', '');
  const centerValue = stringProp(node, 'centerValue', '');
  const gap = numberProp(node, 'gap', 0.02);
  const progress = numberProp(node, 'progress', 1);
  const opacity = numberProp(node, 'opacity', 1);
  const total = Math.max(1, segments.reduce((a, s) => a + (s.value || 0), 0));
  let cursor = -Math.PI / 2;
  const arcs = segments.map((s) => {
    const frac = (s.value || 0) / total;
    const len = frac * Math.PI * 2 * progress;
    const a = { start: cursor, length: len, color: s.color, label: s.label };
    cursor += frac * Math.PI * 2;
    return a;
  });
  return (
    <group>
      {arcs.map((a, i) => (
        <mesh key={i} rotation={[0, 0, a.start]}>
          <ringGeometry args={[radius - thickness, radius, 48, 1, 0, Math.max(0.001, a.length - gap)]} />
          <meshBasicMaterial color={a.color} transparent opacity={opacity} toneMapped={false} side={2} />
        </mesh>
      ))}
      {centerValue && <Text fontSize={radius * 0.45} color="#ffffff" anchorX="center" anchorY="middle" position={[0, 0.05, 0]} characters={NUM}>{centerValue}</Text>}
      {centerLabel && <Text fontSize={radius * 0.18} color="#9fb0c9" anchorX="center" anchorY="middle" position={[0, -radius * 0.25, 0]} characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/">{centerLabel}</Text>}
    </group>
  );
}

export function StatGridRenderer({ node }: { node: MotionNode }) {
  const items = (node.props.items as Array<{ value: string; label: string; delta?: string }>) ?? [];
  const columns = numberProp(node, 'columns', 2);
  const width = numberProp(node, 'width', 4);
  const height = numberProp(node, 'height', 2);
  const cardColor = stringProp(node, 'cardColor', '#111823');
  const valueColor = stringProp(node, 'valueColor', '#ffffff');
  const labelColor = stringProp(node, 'labelColor', '#9fb0c9');
  const gap = numberProp(node, 'gap', 0.12);
  const opacity = numberProp(node, 'opacity', 1);
  const rows = Math.ceil(items.length / columns);
  const cellW = (width - gap * (columns - 1)) / columns;
  const cellH = (height - gap * (rows - 1)) / rows;
  return (
    <group>
      {items.map((it, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const x = -width / 2 + cellW / 2 + col * (cellW + gap);
        const y = height / 2 - cellH / 2 - row * (cellH + gap);
        return (
          <group key={i} position={[x, y, 0]}>
            <mesh>
              <planeGeometry args={[cellW, cellH]} />
              <meshBasicMaterial color={cardColor} transparent opacity={opacity} toneMapped={false} />
            </mesh>
            <Text fontSize={cellH * 0.32} color={valueColor} anchorX="center" anchorY="middle" position={[0, cellH * 0.12, 0.001]} characters={NUM}>{it.value}</Text>
            <Text fontSize={cellH * 0.16} color={labelColor} anchorX="center" anchorY="middle" position={[0, -cellH * 0.18, 0.001]} characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/">{it.label}</Text>
            {it.delta && <Text fontSize={cellH * 0.14} color="#59c7a6" anchorX="center" anchorY="middle" position={[0, -cellH * 0.34, 0.001]} characters={NUM}>{it.delta}</Text>}
          </group>
        );
      })}
    </group>
  );
}