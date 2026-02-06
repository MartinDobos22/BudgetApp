export default function LineChart({ data, ariaLabel, valueFormatter = (value) => value }) {
  if (!data || data.length === 0) {
    return (
      <div className="line-chart line-chart--empty" role="img" aria-label={ariaLabel}>
        <p className="muted">Nie sú dostupné dáta.</p>
      </div>
    );
  }

  const values = data.map((entry) => Number(entry?.total) || 0);
  const maxValue = Math.max(...values, 0);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;
  const width = 100;
  const height = 60;
  const padding = 6;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const step = data.length > 1 ? usableWidth / (data.length - 1) : 0;

  const points = data.map((entry, index) => {
    const value = Number(entry?.total) || 0;
    const x = padding + step * index;
    const y = padding + usableHeight * (1 - (value - minValue) / range);
    return { x, y, value, label: entry.label };
  });

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="line-chart" role="img" aria-label={ariaLabel}>
      <svg className="line-chart__svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <g className="line-chart__grid">
          {[0, 0.5, 1].map((ratio) => {
            const y = padding + usableHeight * ratio;
            return <line key={ratio} x1={padding} x2={width - padding} y1={y} y2={y} />;
          })}
        </g>
        <path className="line-chart__path" d={path} />
        {points.map((point) => (
          <circle
            key={`${point.label}-${point.x}`}
            className="line-chart__dot"
            cx={point.x}
            cy={point.y}
            r="1.6"
          />
        ))}
      </svg>
      <div className="line-chart__labels">
        {points.map((point) => (
          <span key={point.label} title={`${point.label}: ${valueFormatter(point.value)}`}>
            {point.label}
          </span>
        ))}
      </div>
      <div className="line-chart__summary">
        <span>Min: {valueFormatter(minValue)}</span>
        <span>Max: {valueFormatter(maxValue)}</span>
      </div>
    </div>
  );
}
