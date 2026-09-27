/**
 * lib/pdf-studio/primitives/RenderMetrics.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * KPI / Metric card grid renderer with positive/negative indicators.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { View, Text } from '@react-pdf/renderer';
import type { MetricsBlock } from '../types';
import type { PdfStyles } from '../styles';

interface RenderMetricsProps {
  block: MetricsBlock;
  styles: PdfStyles;
}

export function RenderMetrics({ block, styles }: RenderMetricsProps) {
  return (
    <View
      wrap={block.wrap ?? false}
      break={block.breakBefore ?? false}
      style={[
        styles.metricsGrid,
        {
          marginTop: block.marginTop ?? 0,
          marginBottom: block.marginBottom ?? 8,
        },
      ]}
    >
      {block.items.map((item) => (
        <View key={item.id} style={styles.metricCard}>
          <Text style={styles.metricValue}>{item.value}</Text>
          <Text style={styles.metricLabel}>{item.label}</Text>
          {item.change && (
            <Text
              style={[
                styles.metricChange,
                item.isPositive !== undefined
                  ? { color: item.isPositive ? '#059669' : '#dc2626' }
                  : {},
              ]}
            >
              {item.change}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
