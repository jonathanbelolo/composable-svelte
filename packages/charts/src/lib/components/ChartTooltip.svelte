<script lang="ts">
/**
 * ChartTooltip - Tooltip component for charts
 */

import type { TooltipState } from '../types/chart.types';

// Props
let {
  tooltip
}: {
  tooltip: TooltipState<any>;
} = $props();

// Format tooltip content
function formatTooltipContent(data: any): string {
  if (!data) return '';

  // If data is a simple object, show key-value pairs
  if (typeof data === 'object') {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  return String(data);
}

// Calculate tooltip position with offset to avoid cursor
const OFFSET_X = 12;
const OFFSET_Y = 12;

const tooltipStyle = $derived(
  tooltip.visible
    ? `
      left: ${tooltip.position.x + OFFSET_X}px;
      top: ${tooltip.position.y + OFFSET_Y}px;
    `
    : ''
);
</script>

{#if tooltip.visible && tooltip.data}
  <div class="chart-tooltip" style={tooltipStyle}>
    <div class="tooltip-content">
      {formatTooltipContent(tooltip.data)}
    </div>
  </div>
{/if}

<style>
  .chart-tooltip {
    position: fixed;
    z-index: 1000;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    max-width: 300px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    animation: fadeIn 0.15s ease-out;
  }

  .tooltip-content {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
