/**
 * Prices Data Management Logic
 */

let state = {
    data: [],
    meta: { page: 1, limit: 15, total: 0, totalPages: 1 },
    filters: {
        region: '',
        product: '',
        date_from: '',
        date_to: '',
        q: ''
    },
    regions: [],
    products: [],
    sources: []
};

// UI Elements
const tableBody = document.getElementById('tableBody');
const paginationBar = document.getElementById('paginationBar');

// Modals
const recordModal = document.getElementById('recordModal');
const importModal = document.getElementById('importModal');
const deleteModal = document.getElementById('deleteModal');

// Forms & Inputs
const recordForm = document.getElementById('recordForm');
const recordIdInput = document.getElementById('recordId');
const modalTitle = document.getElementById('modalTitle');

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load directories (dropdowns)
    await loadDirectories();

    // 2. Load initial data
    await loadData();

    // 3. Setup event listeners
    setupEventListeners();
});

async function loadDirectories() {
    try {
        [state.regions, state.products, state.sources] = await Promise.all([
            API.getRegions(),
            API.getProducts(),
            API.getSources()
        ]);

        populateDropdown('filterRegion', state.regions);
        populateDropdown('filterProduct', state.products);

        populateDropdown('docRegion', state.regions);
        populateDropdown('docProduct', state.products);
        populateDropdown('docSource', state.sources);
    } catch (err) {
        showToast('Ошибка загрузки справочников: ' + err.message, 'error');
    }
}

function populateDropdown(id, items) {
    const select = document.getElementById(id);
    if (!select) return;

    // Keep first blank option
    const firstOpt = select.firstElementChild;
    select.innerHTML = '';
    select.appendChild(firstOpt);

    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        select.appendChild(option);
    });
}

async function loadData(page = 1) {
    state.meta.page = page;

    try {
        const params = {
            ...state.filters,
            page: state.meta.page,
            limit: state.meta.limit
        };

        tableBody.innerHTML = '<tr><td colspan="8" class="text-center">Загрузка данных...</td></tr>';

        const response = await API.getPrices(params);
        state.data = response.data;
        state.meta = response.meta;

        renderTable();
        renderPagination();
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center error-text">Ошибка: ${err.message}</td></tr>`;
        showToast('Ошибка загрузки данных', 'error');
    }
}

function renderTable() {
    if (!state.data || state.data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center empty-state">Данные не найдены</td></tr>';
        return;
    }

    tableBody.innerHTML = state.data.map(row => {
        const changeClass = row.change_pct > 0 ? 'text-danger' : (row.change_pct < 0 ? 'text-success' : '');
        const changeText = row.change_pct ? `${row.change_pct > 0 ? '+' : ''}${row.change_pct.toFixed(2)}%` : '—';

        // Ensure price formatting
        const price = (row.price_som || 0).toFixed(2);

        return `
            <tr>
                <td>${row.date}</td>
                <td>${row.region_name || '—'}</td>
                <td>${row.product_name || '—'}</td>
                <td>${row.unit || '—'}</td>
                <td class="font-medium">${price}</td>
                <td class="${changeClass}">${changeText}</td>
                <td><small>${row.source_name || '—'}</small></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon text-primary" onclick="editRecord(${row.id})" title="Редактировать">✏️</button>
                        <button class="btn-icon text-danger" onclick="confirmDelete(${row.id})" title="Удалить">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPagination() {
    const { page, totalPages } = state.meta;

    if (totalPages <= 1) {
        paginationBar.innerHTML = '';
        return;
    }

    let html = `<span class="pagination-info">Страница ${page} из ${totalPages}</span> <div class="pagination-buttons">`;

    if (page > 1) {
        html += `<button class="btn btn-sm btn-outline" onclick="loadData(${page - 1})">Назад</button>`;
    } else {
        html += `<button class="btn btn-sm btn-outline" disabled>Назад</button>`;
    }

    if (page < totalPages) {
        html += `<button class="btn btn-sm btn-outline" onclick="loadData(${page + 1})">Вперед</button>`;
    } else {
        html += `<button class="btn btn-sm btn-outline" disabled>Вперед</button>`;
    }

    html += '</div>';
    paginationBar.innerHTML = html;
}

// Event Listeners Setup
function setupEventListeners() {
    // --- Filters ---
    document.getElementById('btnApplyFilters').addEventListener('click', () => {
        state.filters = {
            region: document.getElementById('filterRegion').value,
            product: document.getElementById('filterProduct').value,
            date_from: document.getElementById('filterDateFrom').value,
            date_to: document.getElementById('filterDateTo').value,
            q: document.getElementById('filterSearch').value.trim()
        };
        loadData(1);
    });

    document.getElementById('btnResetFilters').addEventListener('click', () => {
        document.getElementById('filterRegion').value = '';
        document.getElementById('filterProduct').value = '';
        document.getElementById('filterDateFrom').value = '';
        document.getElementById('filterDateTo').value = '';
        document.getElementById('filterSearch').value = '';

        state.filters = { region: '', product: '', date_from: '', date_to: '', q: '' };
        loadData(1);
    });

    // --- Export ---
    document.getElementById('btnExportCSV').addEventListener('click', () => {
        const url = API.getExportUrl(state.filters);
        window.location.href = url; // trigger download
    });

    // --- Add Modal ---
    document.getElementById('btnOpenAddModal').addEventListener('click', () => {
        openRecordModal();
    });

    document.getElementById('btnCloseModal').addEventListener('click', closeRecordModal);
    document.getElementById('btnCancelModal').addEventListener('click', closeRecordModal);

    document.getElementById('btnSaveRecord').addEventListener('click', async (e) => {
        e.preventDefault();
        if (!recordForm.reportValidity()) return;

        const id = recordIdInput.value;
        const btn = document.getElementById('btnSaveRecord');
        btn.disabled = true;
        btn.textContent = 'Сохранение...';

        try {
            const formData = new FormData(recordForm);
            const data = Object.fromEntries(formData.entries());

            // Explicitly handle empty number fields properly
            if (!data.change_pct) data.change_pct = null;
            if (!data.source_id) data.source_id = null;

            data.price_som = parseFloat(data.price_som);
            data.region_id = parseInt(data.region_id);
            data.product_id = parseInt(data.product_id);

            if (id) {
                await API.updatePriceRecord(id, data);
                showToast('Запись успешно обновлена');
            } else {
                await API.createPriceRecord(data);
                showToast('Запись успешно создана');
            }

            closeRecordModal();
            loadData(state.meta.page);
        } catch (err) {
            showToast('Ошибка сохранения: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Сохранить';
        }
    });

    // --- Delete Modal ---
    document.getElementById('btnCloseDeleteModal').addEventListener('click', closeDeleteModal);
    document.getElementById('btnCancelDeleteModal').addEventListener('click', closeDeleteModal);

    document.getElementById('btnConfirmDelete').addEventListener('click', async () => {
        const id = document.getElementById('deleteFormId').value;
        const btn = document.getElementById('btnConfirmDelete');
        btn.disabled = true;

        try {
            await API.deletePriceRecord(id);
            showToast('Запись удалена');
            closeDeleteModal();
            loadData(state.meta.page);
        } catch (err) {
            showToast('Ошибка удаления: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
        }
    });

    // --- Import Modal ---
    document.getElementById('btnOpenImportModal').addEventListener('click', () => {
        importModal.classList.remove('hidden');
        document.getElementById('importError').classList.add('hidden');
        document.getElementById('csvFileInput').value = '';
    });

    document.getElementById('btnCloseImportModal').addEventListener('click', () => importModal.classList.add('hidden'));
    document.getElementById('btnCancelImportModal').addEventListener('click', () => importModal.classList.add('hidden'));

    document.getElementById('btnUploadCsv').addEventListener('click', async () => {
        const fileInput = document.getElementById('csvFileInput');
        if (!fileInput.files.length) {
            alert('Пожалуйста, выберите файл CSV');
            return;
        }

        const file = fileInput.files[0];
        const btn = document.getElementById('btnUploadCsv');
        const errDiv = document.getElementById('importError');

        btn.disabled = true;
        btn.textContent = 'Загрузка...';
        errDiv.classList.add('hidden');

        try {
            const resp = await API.importCsv(file);
            showToast(resp.message || 'Импорт завершен');
            importModal.classList.add('hidden');
            loadData(1);
        } catch (err) {
            errDiv.textContent = err.message;
            errDiv.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Загрузить';
        }
    });
}

// Controller Actions
window.editRecord = function (id) {
    const record = state.data.find(r => r.id === id);
    if (!record) return;
    openRecordModal(record);
};

window.confirmDelete = function (id) {
    document.getElementById('deleteFormId').value = id;
    deleteModal.classList.remove('hidden');
};

function openRecordModal(record = null) {
    recordForm.reset();

    if (record) {
        modalTitle.textContent = 'Редактировать запись';
        recordIdInput.value = record.id;
        document.getElementById('docDate').value = record.date;
        document.getElementById('docRegion').value = record.region_id;
        document.getElementById('docProduct').value = record.product_id;
        document.getElementById('docPrice').value = record.price_som;
        document.getElementById('docChange').value = record.change_pct !== null ? record.change_pct : '';
        document.getElementById('docSource').value = record.source_id || '';
        document.getElementById('docNotes').value = record.notes || '';
    } else {
        modalTitle.textContent = 'Добавить запись';
        recordIdInput.value = '';
        document.getElementById('docDate').value = new Date().toISOString().split('T')[0];
    }

    recordModal.classList.remove('hidden');
    // document.getElementById('docDate').focus();
}

function closeRecordModal() {
    recordModal.classList.add('hidden');
}

function closeDeleteModal() {
    deleteModal.classList.add('hidden');
}
