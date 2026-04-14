/**
 * Analytics logic – fetches from /api/analytics/price-trends
 * Includes: date range filtering (presets + custom), auto-aggregation for large ranges
 */

let trendChartInst = null;
let regionChartInst = null;

const API_BASE = '/api';

/* ═══════ Date range helpers ═══════ */

/**
 * Calculate the date range for a preset period key.
 * Returns { dateFrom: 'YYYY-MM-DD', dateTo: 'YYYY-MM-DD' }
 */
function getPresetDateRange(preset) {
    const now = new Date();
    const to = now.toISOString().slice(0, 10); // today YYYY-MM-DD

    let from;
    switch (preset) {
        case '1m': {
            const d = new Date(now);
            d.setMonth(d.getMonth() - 1);
            from = d.toISOString().slice(0, 10);
            break;
        }
        case '3m': {
            const d = new Date(now);
            d.setMonth(d.getMonth() - 3);
            from = d.toISOString().slice(0, 10);
            break;
        }
        case '6m': {
            const d = new Date(now);
            d.setMonth(d.getMonth() - 6);
            from = d.toISOString().slice(0, 10);
            break;
        }
        case '1y': {
            const d = new Date(now);
            d.setFullYear(d.getFullYear() - 1);
            from = d.toISOString().slice(0, 10);
            break;
        }
        default:
            return { dateFrom: '', dateTo: '' };
    }
    return { dateFrom: from, dateTo: to };
}

/**
 * Determine the number of days in a date range.
 */
function daysBetween(dateFrom, dateTo) {
    const a = new Date(dateFrom);
    const b = new Date(dateTo);
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Get ISO week identifier for a date: YYYY-Www
 */
function getISOWeek(dateStr) {
    const d = new Date(dateStr);
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Get month identifier for a date: YYYY-MM
 */
function getMonthKey(dateStr) {
    return dateStr.slice(0, 7); // "2026-04"
}

/**
 * Aggregate trend data points by a grouping function.
 * Returns averaged data grouped by week or month, with the midpoint date as label.
 */
function aggregateTrends(trendsData, groupFn) {
    const buckets = {};

    trendsData.forEach(point => {
        const key = groupFn(point.date);
        if (!buckets[key]) {
            buckets[key] = { dates: [], prices: [], totalDataPoints: 0 };
        }
        buckets[key].dates.push(point.date);
        buckets[key].prices.push(point.avg_price);
        buckets[key].totalDataPoints += (point.data_points || 1);
    });

    return Object.keys(buckets)
        .sort()
        .map(key => {
            const bucket = buckets[key];
            const avgPrice = bucket.prices.reduce((s, v) => s + v, 0) / bucket.prices.length;
            // Use the middle date of the bucket as the representative date
            const midIdx = Math.floor(bucket.dates.length / 2);
            const sortedDates = bucket.dates.sort();
            return {
                date: sortedDates[midIdx] || sortedDates[0],
                avg_price: Math.round(avgPrice * 100) / 100,
                data_points: bucket.totalDataPoints
            };
        });
}

/**
 * Determine aggregation strategy based on range span in days.
 * Returns { groupFn, label } or null if no aggregation needed.
 */
function getAggregationStrategy(days) {
    if (days > 180) {
        return { groupFn: getMonthKey, label: 'Данные сгруппированы по месяцам' };
    }
    if (days > 60) {
        return { groupFn: getISOWeek, label: 'Данные сгруппированы по неделям' };
    }
    return null; // Daily data is fine
}


/* ═══════ Main init ═══════ */

document.addEventListener('DOMContentLoaded', async () => {
    if (!document.getElementById('trendChart') || !document.getElementById('regionChart')) return;

    await loadProducts();
    await loadRegions();
    
    // Initial load with default preset (1 month)
    await loadAnalyticsData();

    // Product filter
    document.getElementById('filterProduct').addEventListener('change', () => {
        loadAnalyticsData();
    });
    
    // Region filter
    const filterRegion = document.getElementById('filterTrendRegion');
    if (filterRegion) {
        filterRegion.addEventListener('change', () => {
            loadAnalyticsData();
        });
    }

    // Period preset dropdown
    const periodSelect = document.getElementById('filterTrendPeriod');
    const customDateRange = document.getElementById('customDateRange');
    if (periodSelect) {
        periodSelect.addEventListener('change', () => {
            const val = periodSelect.value;
            if (val === 'custom') {
                customDateRange.style.display = '';
                // Pre-fill with last month dates if empty
                const fromInput = document.getElementById('filterDateFrom');
                const toInput = document.getElementById('filterDateTo');
                if (!fromInput.value || !toInput.value) {
                    const { dateFrom, dateTo } = getPresetDateRange('1m');
                    fromInput.value = dateFrom;
                    toInput.value = dateTo;
                }
                loadAnalyticsData();
            } else {
                customDateRange.style.display = 'none';
                loadAnalyticsData();
            }
        });
    }

    // Custom date inputs
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    if (dateFromInput) {
        dateFromInput.addEventListener('change', () => loadAnalyticsData());
    }
    if (dateToInput) {
        dateToInput.addEventListener('change', () => loadAnalyticsData());
    }
});

async function loadProducts() {
    try {
        const res = await fetch(`${API_BASE}/products`);
        const products = await res.json();
        
        const select = document.getElementById('filterProduct');
        select.innerHTML = '<option value="">Все продукты (Сводка)</option>';
        
        products.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Failed to load products:', err);
    }
}

async function loadRegions() {
    try {
        const res = await fetch(`${API_BASE}/regions`);
        const regions = await res.json();
        
        const select = document.getElementById('filterTrendRegion');
        if (!select) return;
        
        select.innerHTML = '<option value="">Все регионы</option>';
        
        regions.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.name;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Failed to load regions:', err);
    }
}

/**
 * Get the current date filter values from the UI.
 */
function getDateFilterValues() {
    const periodSelect = document.getElementById('filterTrendPeriod');
    const preset = periodSelect ? periodSelect.value : '1m';

    if (preset === 'custom') {
        const fromVal = document.getElementById('filterDateFrom')?.value || '';
        const toVal = document.getElementById('filterDateTo')?.value || '';
        return { dateFrom: fromVal, dateTo: toVal };
    }

    return getPresetDateRange(preset);
}

async function loadAnalyticsData() {
    try {
        const productId = document.getElementById('filterProduct').value;
        const regionSelect = document.getElementById('filterTrendRegion');
        const regionId = regionSelect ? regionSelect.value : '';
        const { dateFrom, dateTo } = getDateFilterValues();
        
        // 1. Fetch dataset for Line Chart & Stats (filtered by region + date)
        const paramsFiltered = new URLSearchParams();
        if (productId) paramsFiltered.append('product_id', productId);
        if (regionId) paramsFiltered.append('region_id', regionId);
        if (dateFrom) paramsFiltered.append('date_from', dateFrom);
        if (dateTo) paramsFiltered.append('date_to', dateTo);
        const queryFiltered = paramsFiltered.toString() ? `?${paramsFiltered.toString()}` : '';
        
        // 2. Fetch dataset for Bar Chart (unfiltered by region but WITH date filter)
        const paramsUnfiltered = new URLSearchParams();
        if (productId) paramsUnfiltered.append('product_id', productId);
        if (dateFrom) paramsUnfiltered.append('date_from', dateFrom);
        if (dateTo) paramsUnfiltered.append('date_to', dateTo);
        const queryUnfiltered = paramsUnfiltered.toString() ? `?${paramsUnfiltered.toString()}` : '';
        
        const [resFiltered, resUnfiltered] = await Promise.all([
            fetch(`${API_BASE}/analytics/price-trends${queryFiltered}`),
            fetch(`${API_BASE}/analytics/price-trends${queryUnfiltered}`)
        ]);
        
        const dataFiltered = await resFiltered.json();
        const dataUnfiltered = await resUnfiltered.json();

        updateStats(dataFiltered.stats, productId);

        // ─── Aggregation logic ───
        let trendsToRender = dataFiltered.trends;
        let aggregationLabel = null;

        if (dateFrom && dateTo) {
            const days = daysBetween(dateFrom, dateTo);
            const strategy = getAggregationStrategy(days);
            if (strategy && trendsToRender.length > 15) {
                trendsToRender = aggregateTrends(trendsToRender, strategy.groupFn);
                aggregationLabel = strategy.label;
            }
        }

        // Show/hide aggregation badge
        const aggBadge = document.getElementById('aggBadge');
        const aggBadgeText = document.getElementById('aggBadgeText');
        if (aggBadge) {
            if (aggregationLabel) {
                aggBadgeText.textContent = aggregationLabel;
                aggBadge.style.display = '';
            } else {
                aggBadge.style.display = 'none';
            }
        }

        renderTrendChart(trendsToRender);
        
        // The bottom Bar Chart always compares all regions
        renderRegionChart(dataUnfiltered.regional);
    } catch (err) {
        console.error('Failed to load analytics:', err);
    }
}

function updateStats(stats, hasProductFilter) {
    document.getElementById('statRecords').textContent = stats.total_records || '0';
    document.getElementById('statPrice').textContent = stats.overall_avg_price ? stats.overall_avg_price.toFixed(2) : '--';
    document.getElementById('statRegions').textContent = stats.total_regions || '0';
    
    const select = document.getElementById('filterProduct');
    const productName = hasProductFilter ? `(${select.options[select.selectedIndex].text})` : '(Все)';
    document.getElementById('statProductName').textContent = productName;
}

// Date formatter: YYYY-MM-DD → DD.MM.YYYY (for chart labels and tooltips)
function formatDateRussian(dateString) {
    if (!dateString) return '';
    const dateOnly = dateString.split('T')[0];
    const parts = dateOnly.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return dateString;
}

function renderTrendChart(trendsData) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    if (trendChartInst) {
        trendChartInst.destroy();
    }

    // Format dates right away for x-axis
    const labels = trendsData.map(d => formatDateRussian(d.date));
    const dataPoints = trendsData.map(d => d.avg_price);

    trendChartInst = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Средняя цена',
                data: dataPoints,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#3b82f6',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function(context) {
                            return context[0].label; // It's already formatted DD-Month-YYYY
                        },
                        label: function(context) {
                            return `Цена: ${context.raw} сом`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Цена (сом)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Дата'
                    }
                }
            }
        }
    });
}

function renderRegionChart(regionalData) {
    const ctx = document.getElementById('regionChart').getContext('2d');
    
    if (regionChartInst) {
        regionChartInst.destroy();
    }

    const labels = regionalData.map(d => d.region_name);
    const dataPoints = regionalData.map(d => d.avg_price);

    // Dynamic colors based on value to look nice
    const bgColors = dataPoints.map((_, i) => `hsla(217, 91%, ${minMaxRatio(i, dataPoints.length)}%, 0.8)`);

    regionChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Средняя цена по региону (сом)',
                data: dataPoints,
                backgroundColor: '#3b82f6', // soft blue
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Цена (сом)'
                    }
                }
            }
        }
    });
}

function minMaxRatio(index, total) {
    // Math logic to generate a gradient from dark blue to light blue based on sorting
    const startLightness = 50; 
    const step = 30 / (total || 1);
    return startLightness + (index * step);
}


/* ═══════════════════════════════════════════════════════════════════════
   MONITORING POINTS COVERAGE — Doughnut Chart + Drill-down
   ═══════════════════════════════════════════════════════════════════════ */

// Sophisticated color palette — deep blue, cyan, teal, slate
const COVERAGE_PALETTE = [
    '#1D4ED8', // бишкек
    '#1ded39ff', // джалал-абад
    '#f0630bff', // баткен
    '#0e691bff', // ош город
    '#f60f0fff', // чуй
    '#230a63ff', // ош обл
    '#dc13e0ff', // иссык-куль
    '#73c4fdff', // нарын
    '#0284C7', // Sky Blue
    '#7C3AED', // Violet
    '#0369A1', // Steel Blue
    '#047857', // Green
    '#334155', // Slate
    '#475569', // Gray Blue
];

let coverageChartInst = null;
let coverageDataCache = null;  // Cache for click handler

async function loadCoverageData() {
    const chartEl = document.getElementById('coverageChart');
    if (!chartEl) return;

    try {
        const res = await fetch('/api/analytics/coverage');
        const data = await res.json();
        coverageDataCache = data;

        // Update header stats
        document.getElementById('coverageTotalPoints').textContent = data.total_points;
        document.getElementById('coverageTotalRegions').textContent = data.total_regions;

        renderCoverageLegend(data);

        // Scroll-Triggered Animation using Intersection Observer
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    renderCoverageChart(data);
                    observer.disconnect();
                }
            }, { threshold: 0.2 });
            observer.observe(chartEl.parentElement); // Observe the wrapper for earlier trigger
        } else {
            renderCoverageChart(data);
        }
    } catch (err) {
        console.error('Failed to load coverage data:', err);
    }
}

function renderCoverageChart(data) {
    const ctx = document.getElementById('coverageChart').getContext('2d');

    if (coverageChartInst) {
        coverageChartInst.destroy();
    }

    const labels = data.regions.map(r => r.region_name);
    const values = data.regions.map(r => r.point_count);
    const colors = data.regions.map((_, i) => COVERAGE_PALETTE[i % COVERAGE_PALETTE.length]);

    coverageChartInst = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverBorderWidth: 3,
                hoverBorderColor: '#ffffff',
                hoverOffset: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '60%',
            plugins: {
                legend: {
                    display: false   // We build a custom legend
                },
                tooltip: {
                    backgroundColor: '#0F172A',
                    titleColor: '#fff',
                    bodyColor: '#CBD5E1',
                    padding: 12,
                    cornerRadius: 10,
                    displayColors: true,
                    boxPadding: 6,
                    callbacks: {
                        label: function(ctx) {
                            const region = data.regions[ctx.dataIndex];
                            return ` ${region.point_count} точек (${region.percentage}%)`;
                        }
                    }
                }
            },
            onClick: (evt, elements) => {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    openDrilldown(data.regions[idx]);
                }
            }
        }
    });
}

function renderCoverageLegend(data) {
    const container = document.getElementById('coverageLegend');
    if (!container) return;

    container.innerHTML = data.regions.map((region, i) => {
        const color = COVERAGE_PALETTE[i % COVERAGE_PALETTE.length];
        return `
            <div class="legend-item" data-index="${i}">
                <span class="legend-dot" style="background:${color};"></span>
                <div class="legend-info">
                    <div class="legend-name">${region.region_name}</div>
                    <div class="legend-meta">${region.point_count} точек</div>
                </div>
                <span class="legend-pct">${region.percentage}%</span>
            </div>
        `;
    }).join('');

    // Make legend items clickable for drill-down
    container.querySelectorAll('.legend-item').forEach(item => {
        item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.index);
            openDrilldown(data.regions[idx]);
        });
    });
}


/* ═══════ Drill-down Modal Logic ═══════ */

function openDrilldown(regionData) {
    document.getElementById('drillTag').textContent = 'РЕГИОН';
    document.getElementById('drillTitle').textContent = regionData.region_name;
    document.getElementById('drillPoints').textContent = regionData.point_count;
    document.getElementById('drillPct').textContent = regionData.percentage + '%';

    const list = document.getElementById('drillSources');
    list.innerHTML = regionData.sources.map(name =>
        `<li>${name}</li>`
    ).join('');

    document.getElementById('drillOverlay').classList.add('active');
}

function closeDrilldown() {
    document.getElementById('drillOverlay').classList.remove('active');
}

// Wire up close button and backdrop click
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('drillOverlay');
    const closeBtn = document.getElementById('drillClose');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeDrilldown);
    }
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeDrilldown();
        });
    }

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDrilldown();
    });

    // Load coverage data
    loadCoverageData();
});


/* ═══════════════════════════════════════════════════════════════════════
   INTERACTIVE GEOGRAPHY HEATMAP — SVG Map of Kyrgyzstan
   ═══════════════════════════════════════════════════════════════════════ */

let geoHeatmapObserver = null;
let geoHasAnimated = false;
let geoRegionalData = []; // current regional price data for the map

/**
 * Interpolate between two RGB colors.
 * t = 0 → colorA, t = 1 → colorB
 */
function lerpColor(colorA, colorB, t) {
    const r = Math.round(colorA[0] + (colorB[0] - colorA[0]) * t);
    const g = Math.round(colorA[1] + (colorB[1] - colorA[1]) * t);
    const b = Math.round(colorA[2] + (colorB[2] - colorA[2]) * t);
    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Given a value between min/max, return a green-yellow-red heatmap color.
 * Green (#4ade80) = cheapest, Yellow (#facc15) = average, Red (#ef4444) = most expensive.
 */
function getHeatmapColor(value, min, max) {
    if (max === min) return 'rgb(250, 204, 21)'; // mid yellow
    const t = (value - min) / (max - min);

    // Three-stop gradient: green → yellow → red
    const green  = [74, 222, 128];  // #4ade80
    const yellow = [250, 204, 21];  // #facc15
    const red    = [239, 68, 68];   // #ef4444

    if (t <= 0.5) {
        return lerpColor(green, yellow, t * 2);
    } else {
        return lerpColor(yellow, red, (t - 0.5) * 2);
    }
}

/**
 * Map DB region names to SVG data-region attributes.
 * The DB might have slightly different naming; this handles normalization.
 */
function matchRegionName(dbName) {
    if (!dbName) return null;
    const n = dbName.trim().toLowerCase();
    const map = {
        'чуйская обл.': 'Чуйская обл.',
        'чуйская область': 'Чуйская обл.',
        'г. бишкек': 'г. Бишкек',
        'бишкек': 'г. Бишкек',
        'иссык-кульская обл.': 'Иссык-Кульская обл.',
        'иссык-кульская область': 'Иссык-Кульская обл.',
        'таласская обл.': 'Таласская обл.',
        'таласская область': 'Таласская обл.',
        'нарынская обл.': 'Нарынская обл.',
        'нарынская область': 'Нарынская обл.',
        'джалал-абадская обл.': 'Джалал-Абадская обл.',
        'джалал-абадская область': 'Джалал-Абадская обл.',
        'ошская обл.': 'Ошская обл.',
        'ошская область': 'Ошская обл.',
        'г. ош': 'г. Ош',
        'ош': 'г. Ош',
        'баткенская обл.': 'Баткенская обл.',
        'баткенская область': 'Баткенская обл.',
    };
    return map[n] || dbName;
}

/**
 * Apply heatmap colors to SVG regions based on regional price data.
 */
function applyHeatmapColors(regionalData) {
    geoRegionalData = regionalData;
    const paths = document.querySelectorAll('#kyrgyzstanMap .geo-region');
    if (!paths.length || !regionalData.length) return;

    // Build a lookup: SVG region name → avg_price
    const priceMap = {};
    regionalData.forEach(r => {
        const svgName = matchRegionName(r.region_name);
        if (svgName) priceMap[svgName] = r.avg_price;
    });

    const prices = Object.values(priceMap);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    paths.forEach(path => {
        const regionName = path.getAttribute('data-region');
        const price = priceMap[regionName];

        if (price !== undefined) {
            const color = getHeatmapColor(price, minPrice, maxPrice);
            path.style.setProperty('--geo-fill', color);
            // If not yet animated, set fill directly for non-animated state
            if (!geoHasAnimated) {
                // keep default gray, will animate on scroll
            } else {
                path.style.fill = color;
            }
        } else {
            path.style.setProperty('--geo-fill', '#E2E8F0');
            if (geoHasAnimated) {
                path.style.fill = '#E2E8F0';
            }
        }
    });

    // Re-trigger animation if already visible
    if (geoHasAnimated) {
        triggerGeoAnimation();
    }
}

/**
 * Trigger the scroll-based fill animation by toggling the CSS class.
 */
function triggerGeoAnimation() {
    const card = document.getElementById('geoHeatmapCard');
    if (!card) return;
    card.classList.remove('geo-animated');
    // Force reflow for re-trigger
    void card.offsetWidth;
    card.classList.add('geo-animated');
}

/**
 * Set up the IntersectionObserver for scroll-triggered animation.
 */
function setupGeoObserver() {
    const card = document.getElementById('geoHeatmapCard');
    if (!card) return;

    geoHeatmapObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !geoHasAnimated) {
                geoHasAnimated = true;
                triggerGeoAnimation();
                // Don't disconnect — we might want re-animation on data change
            }
        });
    }, { threshold: 0.25 });

    geoHeatmapObserver.observe(card);
}

/**
 * Set up mouse tooltip for SVG regions.
 */
function setupGeoTooltip() {
    const wrapper = document.getElementById('geoSvgWrapper');
    const tooltip = document.getElementById('geoTooltip');
    const tooltipName = document.getElementById('geoTooltipName');
    const tooltipPrice = document.getElementById('geoTooltipPrice');
    if (!wrapper || !tooltip) return;

    const paths = document.querySelectorAll('#kyrgyzstanMap .geo-region');

    paths.forEach(path => {
        path.addEventListener('mouseenter', () => {
            const regionName = path.getAttribute('data-region');
            const priceData = geoRegionalData.find(r => matchRegionName(r.region_name) === regionName);

            tooltipName.textContent = regionName;
            tooltipPrice.textContent = priceData
                ? `${priceData.avg_price.toFixed(2)} сом`
                : 'Нет данных';

            tooltip.style.display = '';
        });

        path.addEventListener('mousemove', (e) => {
            const rect = wrapper.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            tooltip.style.left = x + 'px';
            tooltip.style.top = y + 'px';
        });

        path.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    });
}

/**
 * Fetch regional price data for a specific product and update the heatmap.
 */
async function loadGeoHeatmapData(productId = '') {
    try {
        const params = new URLSearchParams();
        if (productId) params.append('product_id', productId);

        const res = await fetch(`${API_BASE}/analytics/price-trends?${params.toString()}`);
        const data = await res.json();

        applyHeatmapColors(data.regional || []);
    } catch (err) {
        console.error('Failed to load heatmap data:', err);
    }
}

/**
 * Populate the map's product dropdown (independent of the main filter).
 */
async function setupGeoMapDropdown() {
    const select = document.getElementById('filterMapProduct');
    if (!select) return;

    try {
        const res = await fetch(`${API_BASE}/products`);
        const products = await res.json();

        select.innerHTML = '<option value="">Все продукты (Средняя)</option>';
        products.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            select.appendChild(opt);
        });

        select.addEventListener('change', () => {
            // Reset animation to replay on data change
            geoHasAnimated = false;
            const card = document.getElementById('geoHeatmapCard');
            if (card) card.classList.remove('geo-animated');

            loadGeoHeatmapData(select.value).then(() => {
                // Check if card is in view, if so animate immediately
                const rect = card.getBoundingClientRect();
                const inView = rect.top < window.innerHeight && rect.bottom > 0;
                if (inView) {
                    geoHasAnimated = true;
                    triggerGeoAnimation();
                }
            });
        });
    } catch (err) {
        console.error('Failed to populate map dropdown:', err);
    }
}

// Initialize Heatmap on page load
document.addEventListener('DOMContentLoaded', async () => {
    if (!document.getElementById('kyrgyzstanMap')) return;

    setupGeoTooltip();
    setupGeoObserver();
    await setupGeoMapDropdown();
    await loadGeoHeatmapData(); // Load with all products initially
});
