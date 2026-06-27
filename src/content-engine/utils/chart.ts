interface ChartItem {
  label: string;
  value: number;
}

export interface PieSlice {
  label: string;
  value: number;
  percentage: number;
  color: string;
  path: string;
  labelX: number;
  labelY: number;
}

const DEFAULT_PIE_COLORS = ["#1b7f83", "#db5b30", "#f0b84f", "#4467b0", "#7b5ea7", "#4f8f55"];

export function buildPieSlices(items: ChartItem[], width: number, height: number, colors = DEFAULT_PIE_COLORS): PieSlice[] {
  const safeItems = items.map((item) => ({ ...item, value: Math.max(0, item.value) }));
  const total = safeItems.reduce((sum, item) => sum + item.value, 0);
  const effectiveTotal = total > 0 ? total : safeItems.length || 1;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.34;
  let startAngle = -90;

  return safeItems.map((item, index) => {
    const value = total > 0 ? item.value : 1;
    const percentage = value / effectiveTotal;
    const endAngle = startAngle + percentage * 360;
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const labelPoint = polarToCartesian(cx, cy, radius * 0.64, startAngle + (endAngle - startAngle) / 2);
    const path = [
      `M ${cx} ${cy}`,
      `L ${start.x} ${start.y}`,
      `A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`,
      "Z"
    ].join(" ");

    startAngle = endAngle;
    return {
      label: item.label,
      value: item.value,
      percentage,
      color: colors[index % colors.length],
      path,
      labelX: labelPoint.x,
      labelY: labelPoint.y
    };
  });
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDegrees: number): { x: number; y: number } {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  return {
    x: Number((cx + radius * Math.cos(angleRadians)).toFixed(3)),
    y: Number((cy + radius * Math.sin(angleRadians)).toFixed(3))
  };
}
