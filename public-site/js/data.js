// Dummy data for prices
const PURE_DATA = [
    { id: 1, date: '2026-02-23', region: 'г. Бишкек', product: 'Хлеб пшеничный', unit: 'булка', price: 25.0, prevPrice: 24.5, source: 'Рынок "Ошский"' },
    { id: 2, date: '2026-02-23', region: 'г. Бишкек', product: 'Мука 1 сорт', unit: 'кг', price: 42.0, prevPrice: 42.0, source: 'Глобус' },
    { id: 3, date: '2026-02-23', region: 'Чуйская обл.', product: 'Сахар', unit: 'кг', price: 85.0, prevPrice: 83.5, source: 'Рынок "Аламедин"' },
    { id: 4, date: '2026-02-23', region: 'Ошская обл.', product: 'Рис', unit: 'кг', price: 110.0, prevPrice: 112.0, source: 'Рынок "Кара-Суу"' },
    { id: 5, date: '2026-02-23', region: 'Джалал-Абадская обл.', product: 'Масло подсолнечное', unit: 'литр', price: 140.0, prevPrice: 140.0, source: 'Центральный рынок' },
    { id: 6, date: '2026-02-23', region: 'Иссык-Кульская обл.', product: 'Яйца (10 шт)', unit: 'упак', price: 115.0, prevPrice: 110.0, source: 'Рынок "Ак-Тилек"' },
    { id: 7, date: '2026-02-22', region: 'Нарынская обл.', product: 'Молоко', unit: 'литр', price: 60.0, prevPrice: 60.0, source: 'Фермерский рынок' },
    { id: 8, date: '2026-02-22', region: 'Таласская обл.', product: 'Мясо говядина', unit: 'кг', price: 550.0, prevPrice: 540.0, source: 'Рынок "Талас"' },
    { id: 9, date: '2026-02-22', region: 'Баткенская обл.', product: 'Макаронные изделия', unit: 'кг', price: 55.0, prevPrice: 55.0, source: 'Центральный рынок' },
    { id: 10, date: '2026-02-22', region: 'г. Ош', product: 'Хлеб пшеничный', unit: 'булка', price: 24.0, prevPrice: 24.0, source: 'Рынок "Келечек"' },
    { id: 11, date: '2026-02-21', region: 'г. Бишкек', product: 'Мясо баранина', unit: 'кг', price: 580.0, prevPrice: 590.0, source: 'Рынок "Орто-Сай"' },
    { id: 12, date: '2026-02-21', region: 'Чуйская обл.', product: 'Картофель', unit: 'кг', price: 35.0, prevPrice: 32.0, source: 'Рынок "Дордой-Дыйкан"' },
];

let currentData = [...PURE_DATA];
let sortCol = 'date';
let sortDesc = true;

// Utility to calculate percentage change
function calcChange(price, prevPrice) {
    if (!prevPrice) return 0;
    return (((price - prevPrice) / prevPrice) * 100).toFixed(1);
}

function renderTableData() {
    const tbody = document.getElementById('dataTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (currentData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Нет данных по выбранным фильтрам</td></tr>';
        return;
    }

    currentData.forEach(item => {
        const change = calcChange(item.price, item.prevPrice);
        let trendClass = 'trend-neutral';
        let changeText = '0%';

        if (change > 0) {
            trendClass = 'trend-up';
            changeText = '+' + change + '%';
        } else if (change < 0) {
            trendClass = 'trend-down';
            changeText = change + '%';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${item.date}</td>
      <td>${item.region}</td>
      <td>${item.product}</td>
      <td>${item.unit}</td>
      <td><strong>${item.price.toFixed(2)}</strong></td>
      <td class="${trendClass}">${changeText}</td>
      <td>${item.source}</td>
    `;
        tbody.appendChild(tr);
    });
}

function applyFilters() {
    const region = document.getElementById('filterRegion')?.value || 'all';
    const category = document.getElementById('filterCategory')?.value || 'all';
    const search = document.getElementById('filterSearch')?.value.toLowerCase() || '';

    currentData = PURE_DATA.filter(item => {
        const matchRegion = region === 'all' || item.region === region;
        // Basic category check (in real app, use a proper category field)
        let matchCat = category === 'all';
        if (!matchCat) {
            if (category === 'bread' && item.product.includes('Хлеб')) matchCat = true;
            if (category === 'flour' && item.product.includes('Мука')) matchCat = true;
            if (category === 'sugar' && item.product.includes('Сахар')) matchCat = true;
            if (category === 'meat' && item.product.includes('Мясо')) matchCat = true;
            if (category === 'veg' && item.product.includes('Картофель')) matchCat = true;
            if (category === 'other' && !item.product.includes('Хлеб') && !item.product.includes('Мука') && !item.product.includes('Сахар') && !item.product.includes('Мясо') && !item.product.includes('Картофель')) matchCat = true;
        }
        const matchSearch = item.product.toLowerCase().includes(search) || item.region.toLowerCase().includes(search);
        return matchRegion && matchCat && matchSearch;
    });

    doSort(sortCol, sortDesc, false);
}

function doSort(col, desc, toggle = true) {
    if (toggle) {
        if (sortCol === col) {
            sortDesc = !sortDesc;
        } else {
            sortCol = col;
            sortDesc = true;
        }
    }

    currentData.sort((a, b) => {
        let valA = a[col];
        let valB = b[col];

        if (col === 'change') {
            valA = parseFloat(calcChange(a.price, a.prevPrice));
            valB = parseFloat(calcChange(b.price, b.prevPrice));
        }

        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
    });

    // Update sort indicators
    document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '');
    const iconEl = document.getElementById(`sort-${col}`);
    if (iconEl) {
        iconEl.textContent = sortDesc ? ' ▼' : ' ▲';
    }

    renderTableData();
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('dataTableBody')) {
        renderTableData();

        // Bind filters
        ['filterRegion', 'filterCategory'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', applyFilters);
        });

        let searchTimeout;
        document.getElementById('filterSearch')?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(applyFilters, 300);
        });

        // Sub sorting bindings in headers
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                doSort(th.getAttribute('data-sort'), true);
            });
            th.style.cursor = 'pointer';
        });
    }
});
