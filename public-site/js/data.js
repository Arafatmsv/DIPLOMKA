/**
 * Data page logic – fetches from the backend API
 * Supports filtering, sorting, search, and pagination.
 */

let state = {
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
    sortCol: 'date',
    sortDesc: true,
    regions: [],
    products: [],
};

const API_BASE = '/api';

// ── SVG Arrow Icons ──
const ARROW_UP = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
const ARROW_DOWN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
const DASH_ICON = `<span style="font-size:1.1rem;">—</span>`;

/**
 * Display date formatter: YYYY-MM-DD → DD.MM.YYYY
 * Only for display — API requests keep ISO format.
 */
function formatDateDisplay(dateStr) {
    if (!dateStr) return '—';
    const dateOnly = dateStr.split('T')[0];
    const parts = dateOnly.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return dateStr;
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
    if (!document.getElementById('dataTableBody')) return;

    // Load region & product dropdowns from API
    await loadDropdowns();

    // Load initial data
    await loadData();

    // Bind controls
    bindFilters();
    bindExports();
});

// ── Dropdown population from backend ──
async function loadDropdowns() {
    try {
        const [regions, products] = await Promise.all([
            fetch(`${API_BASE}/regions`).then(r => r.json()),
            fetch(`${API_BASE}/products`).then(r => r.json())
        ]);
        state.regions = regions;
        state.products = products;

        const regionSelect = document.getElementById('filterRegion');
        if (regionSelect) {
            // Clear existing options except the first "All" option
            const firstOpt = regionSelect.querySelector('option[value="all"]');
            regionSelect.innerHTML = '';
            if (firstOpt) regionSelect.appendChild(firstOpt);
            else {
                const opt = document.createElement('option');
                opt.value = 'all';
                opt.textContent = 'Все регионы';
                regionSelect.appendChild(opt);
            }
            regions.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id;
                opt.textContent = r.name;
                regionSelect.appendChild(opt);
            });
        }

        const categorySelect = document.getElementById('filterCategory');
        if (categorySelect) {
            const firstOpt = categorySelect.querySelector('option[value="all"]');
            categorySelect.innerHTML = '';
            if (firstOpt) categorySelect.appendChild(firstOpt);
            else {
                const opt = document.createElement('option');
                opt.value = 'all';
                opt.textContent = 'Все продукты';
                categorySelect.appendChild(opt);
            }
            products.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                categorySelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.warn('Failed to load dropdowns:', err);
    }
}

// ── Load data from backend ──
async function loadData(page = 1) {
    state.meta.page = page;

    const tbody = document.getElementById('dataTableBody');
    // Show loading state
    tbody.innerHTML = `
        <tr class="loading-row"><td colspan="7">&nbsp;</td></tr>
        <tr class="loading-row"><td colspan="7">&nbsp;</td></tr>
        <tr class="loading-row"><td colspan="7">&nbsp;</td></tr>
    `;

    try {
        const params = new URLSearchParams();

        const regionVal = document.getElementById('filterRegion')?.value;
        const productVal = document.getElementById('filterCategory')?.value;
        const searchVal = document.getElementById('filterSearch')?.value?.trim();
        const dateVal = document.getElementById('filterDate')?.value;

        if (regionVal && regionVal !== 'all') params.set('region', regionVal);
        if (productVal && productVal !== 'all') params.set('product', productVal);
        if (searchVal) params.set('q', searchVal);
        if (dateVal) {
            params.set('date_from', dateVal);
            params.set('date_to', dateVal);
        }

        const sortDir = state.sortDesc ? 'DESC' : 'ASC';
        const sortMap = {
            date: 'date',
            region: 'region',
            product: 'product',
            price: 'price',
            change: 'change'
        };
        const sortField = sortMap[state.sortCol] || 'date';
        params.set('sort', `${sortField} ${sortDir}`);
        params.set('page', state.meta.page);
        params.set('limit', state.meta.limit);

        const res = await fetch(`${API_BASE}/price-records?${params.toString()}`);
        const json = await res.json();

        state.data = json.data || [];
        state.meta = json.meta || state.meta;

        renderTable();
        renderPagination();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:2rem; color: var(--color-danger);">Ошибка загрузки данных: ${err.message}</td></tr>`;
    }
}

// ── Render table rows with green/red change indicators ──
function renderTable() {
    const tbody = document.getElementById('dataTableBody');
    if (!tbody) return;

    if (!state.data || state.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:2.5rem;">Нет данных по выбранным фильтрам</td></tr>';
        return;
    }

    tbody.innerHTML = state.data.map(item => {
        const change = item.change_pct;
        let changeHtml = '';

        if (change > 0) {
            changeHtml = `<span class="change-pill up">${ARROW_UP} +${change.toFixed(1)}%</span>`;
        } else if (change < 0) {
            changeHtml = `<span class="change-pill down">${ARROW_DOWN} ${change.toFixed(1)}%</span>`;
        } else {
            changeHtml = `<span class="change-pill neutral">${DASH_ICON} 0%</span>`;
        }

        const price = (item.price_som || 0).toFixed(2);

        return `
            <tr>
                <td>${formatDateDisplay(item.date)}</td>
                <td>${item.region_name || '—'}</td>
                <td>${item.product_name || '—'}</td>
                <td>${item.unit || '—'}</td>
                <td class="price-cell">${price}</td>
                <td>${changeHtml}</td>
                <td>${item.source_text || item.source_name || '—'}</td>
            </tr>
        `;
    }).join('');
}

// ── Pagination ──
function renderPagination() {
    const infoEl = document.getElementById('paginationInfo');
    const btnsEl = document.getElementById('paginationButtons');
    if (!infoEl || !btnsEl) return;

    const { page, totalPages, total, limit } = state.meta;
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    infoEl.textContent = total > 0 ? `Показано ${start}–${end} из ${total} записей` : 'Нет записей';

    if (totalPages <= 1) {
        btnsEl.innerHTML = '';
        return;
    }

    let html = '';
    if (page > 1) {
        html += `<button class="btn btn-outline" style="padding:0.4rem 0.9rem; font-size:0.85rem;" onclick="loadData(${page - 1})">← Назад</button>`;
    } else {
        html += `<button class="btn btn-outline" style="padding:0.4rem 0.9rem; font-size:0.85rem;" disabled>← Назад</button>`;
    }

    // Page numbers (show max 5)
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    for (let i = startPage; i <= endPage; i++) {
        if (i === page) {
            html += `<button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.85rem; min-width:2.2rem;">${i}</button>`;
        } else {
            html += `<button class="btn btn-outline" style="padding:0.4rem 0.8rem; font-size:0.85rem; min-width:2.2rem;" onclick="loadData(${i})">${i}</button>`;
        }
    }

    if (page < totalPages) {
        html += `<button class="btn btn-outline" style="padding:0.4rem 0.9rem; font-size:0.85rem;" onclick="loadData(${page + 1})">Вперед →</button>`;
    } else {
        html += `<button class="btn btn-outline" style="padding:0.4rem 0.9rem; font-size:0.85rem;" disabled>Вперед →</button>`;
    }

    btnsEl.innerHTML = html;
}

// ── Sorting ──
function doSort(col) {
    if (state.sortCol === col) {
        state.sortDesc = !state.sortDesc;
    } else {
        state.sortCol = col;
        state.sortDesc = true;
    }

    // Update sort indicators in UI
    document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '');
    const iconEl = document.getElementById(`sort-${col}`);
    if (iconEl) {
        iconEl.textContent = state.sortDesc ? ' ▼' : ' ▲';
    }

    loadData(1);
}

// ── Filter bindings ──
function bindFilters() {
    // Dropdown changes
    ['filterRegion', 'filterCategory'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => loadData(1));
    });

    // Date change
    const dateEl = document.getElementById('filterDate');
    if (dateEl) dateEl.addEventListener('change', () => loadData(1));

    // Search with debounce
    let searchTimeout;
    const searchEl = document.getElementById('filterSearch');
    if (searchEl) {
        searchEl.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => loadData(1), 350);
        });
    }

    // Sortable column headers
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            doSort(th.getAttribute('data-sort'));
        });
        th.style.cursor = 'pointer';
    });
}

// ── Export bindings ──
function bindExports() {
    const btnExcel = document.getElementById('btnExportExcel');
    if (btnExcel) {
        btnExcel.addEventListener('click', () => {
            if (!state.data.length) return alert('Нет данных для экспорта');
            const ws = XLSX.utils.json_to_sheet(state.data.map(d => ({
                'Дата': formatDateDisplay(d.date),
                'Регион': d.region_name,
                'Продукт': d.product_name,
                'Ед.изм': d.unit,
                'Цена (сом)': d.price_som,
                'Изм. %': d.change_pct,
                'Источник': d.source_name
            })));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Данные");
            XLSX.writeFile(wb, "Мониторинг_Цен.xlsx");
        });
    }

    const btnPdf = document.getElementById('btnExportPDF');
    if (btnPdf) {
        btnPdf.addEventListener('click', () => {
            if (!state.data.length) return alert('Нет данных для экспорта');
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Add Base64 Cyrillic Font
            if (window.RobotoRegularBase64) {
                doc.addFileToVFS("Roboto-Regular.ttf", window.RobotoRegularBase64);
                doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
                doc.setFont("Roboto");
            }
            
            doc.setFontSize(16);
            doc.text("Отчет по мониторингу цен", 14, 15);
            
            const tableColumn = ["Дата", "Регион", "Продукт", "Ед.изм", "Цена", "Изм. %", "Источник"];
            const tableRows = state.data.map(d => [
                formatDateDisplay(d.date), d.region_name, d.product_name, d.unit || '', 
                d.price_som, d.change_pct || '', d.source_name
            ]);
            
            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 20,
                styles: { font: "Roboto", fontStyle: "normal" }
            });
            
            doc.save("Мониторинг_Цен.pdf");
        });
    }
}
