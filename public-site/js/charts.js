document.addEventListener('DOMContentLoaded', () => {
    const chartContainer = document.getElementById('priceChart');
    if (!chartContainer) return;

    // Simple SVG Line Chart generation
    // Dummy data for "Хлеб пшеничный" over 30 days
    const dataPoints = [22, 22.5, 23, 23, 23, 23.5, 24, 24, 24, 24.5, 24.5, 25];

    const width = chartContainer.clientWidth || 600;
    const height = 300;
    const padding = 40;

    const maxVal = Math.max(...dataPoints) + 2;
    const minVal = Math.min(...dataPoints) - 2;

    const xStep = (width - padding * 2) / (dataPoints.length - 1);
    const yRatio = (height - padding * 2) / (maxVal - minVal);

    let pathData = '';
    let pointsHtml = '';

    dataPoints.forEach((val, index) => {
        const cx = padding + index * xStep;
        const cy = height - padding - (val - minVal) * yRatio;

        if (index === 0) pathData += `M ${cx} ${cy} `;
        else pathData += `L ${cx} ${cy} `;

        pointsHtml += `<circle cx="${cx}" cy="${cy}" r="4" fill="#3b82f6" stroke="#fff" stroke-width="2">
      <title>Цена: ${val} сом</title>
    </circle>`;
    });

    // Y-axis labels
    let yAxisHtml = '';
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
        const val = minVal + (maxVal - minVal) * (i / ySteps);
        const yStr = val.toFixed(1);
        const cy = height - padding - (val - minVal) * yRatio;

        yAxisHtml += `<text x="${padding - 10}" y="${cy + 5}" font-size="12" fill="#64748b" text-anchor="end">${yStr}</text>`;
        yAxisHtml += `<line x1="${padding}" y1="${cy}" x2="${width - padding}" y2="${cy}" stroke="#e2e8f0" stroke-dasharray="4" />`;
    }

    // X-axis (just the line)
    const xAxisHtml = `<line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#94a3b8" />`;

    const svg = `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${yAxisHtml}
      ${xAxisHtml}
      <path d="${pathData}" fill="none" stroke="#3b82f6" stroke-width="3" />
      ${pointsHtml}
    </svg>
  `;

    chartContainer.innerHTML = svg;
});
