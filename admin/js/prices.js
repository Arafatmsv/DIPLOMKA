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
    sortCol: 'date',
    sortDesc: true,
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
        [state.regions, state.products] = await Promise.all([
            API.getRegions(),
            API.getProducts()
        ]);

        populateDropdown('filterRegion', state.regions);
        populateDropdown('filterProduct', state.products);

        populateDropdown('docRegion', state.regions);
        populateDropdown('docProduct', state.products);
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
            sort: `${state.sortCol} ${state.sortDesc ? 'DESC' : 'ASC'}`,
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
                <td>${formatDateDisplay(row.date)}</td>
                <td>${row.region_name || '—'}</td>
                <td>${row.product_name || '—'}</td>
                <td>${row.unit || '—'}</td>
                <td class="font-medium">${price}</td>
                <td class="${changeClass}">${changeText}</td>
                <td><small>${row.source_text || row.source_name || '—'}</small></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon edit-action" onclick="editRecord(${row.id})" title="Редактировать" data-rbac-module="prices" data-rbac-action="Update" data-rbac-behavior="disable">
                            <svg class="icon-action" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.89 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.89l12.675-12.687z"/>
                                <path d="M19.5 7.125L16.862 4.487"/>
                            </svg>
                        </button>
                        <button class="btn-icon delete-action" onclick="confirmDelete(${row.id})" title="Удалить" data-rbac-module="prices" data-rbac-action="Delete" data-rbac-behavior="disable">
                            <svg class="icon-action" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    // Apply RBAC to newly rendered buttons
    if (typeof RBAC !== 'undefined' && RBAC.user) {
        RBAC.applyToDOM();
    }
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
    document.getElementById('btnExportExcel').addEventListener('click', () => {
        if (!state.data.length) return showToast('Нет данных для экспорта', 'error');
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
        XLSX.utils.book_append_sheet(wb, ws, "Мониторинг Цен");
        XLSX.writeFile(wb, "Цена_Мониторинг.xlsx");
    });

    document.getElementById('btnExportPDF').addEventListener('click', () => {
        if (!state.data.length) return showToast('Нет данных для экспорта', 'error');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Add Base64 Cyrillic Font
        doc.addFileToVFS("Roboto-Regular.ttf", window.RobotoRegularBase64);
        doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
        doc.setFont("Roboto");
        
        doc.setFontSize(16);
        doc.text("Отчет по мониторингу цен", 14, 15);
        
        const tableColumn = ["Дата", "Регион", "Продукт", "Ед.изм", "Цена (сом)", "Изм. %", "Источник"];
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
        
        doc.save("Цена_Мониторинг.pdf");
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

            // Explicitly handle empty fields properly
            if (!data.change_pct) data.change_pct = null;
            if (!data.source_text) data.source_text = null;

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
        document.getElementById('excelFileInput').value = '';
    });

    document.getElementById('btnCloseImportModal').addEventListener('click', () => importModal.classList.add('hidden'));
    document.getElementById('btnCancelImportModal').addEventListener('click', () => importModal.classList.add('hidden'));

    document.getElementById('btnUploadExcel').addEventListener('click', async () => {
        const fileInput = document.getElementById('excelFileInput');
        if (!fileInput.files.length) {
            alert('Пожалуйста, выберите файл Excel');
            return;
        }

        const file = fileInput.files[0];
        const btn = document.getElementById('btnUploadExcel');
        const errDiv = document.getElementById('importError');

        btn.disabled = true;
        btn.textContent = 'Обработка...';
        errDiv.classList.add('hidden');

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet);

                    const resp = await API.request('/api/prices/bulk', {
                        method: 'POST',
                        body: JSON.stringify({ records: json })
                    });

                    showToast(resp.message || 'Импорт завершен');
                    importModal.classList.add('hidden');
                    loadData(1);
                } catch (parseErr) {
                    errDiv.textContent = 'Ошибка при чтении Excel: ' + parseErr.message;
                    errDiv.classList.remove('hidden');
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Загрузить';
                }
            };
            reader.onerror = () => {
                errDiv.textContent = 'Ошибка при чтении файла.';
                errDiv.classList.remove('hidden');
                btn.disabled = false;
                btn.textContent = 'Загрузить';
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            errDiv.textContent = err.message;
            errDiv.classList.remove('hidden');
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
        document.getElementById('docSource').value = record.source_text || '';
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

// ── Sorting ──
window.sortPrices = function(col) {
    if (state.sortCol === col) {
        state.sortDesc = !state.sortDesc;
    } else {
        state.sortCol = col;
        state.sortDesc = true;
    }
    // Update arrow indicators
    document.querySelectorAll('.sort-arrow').forEach(el => el.textContent = '');
    const iconEl = document.getElementById(`sort-${col}`);
    if (iconEl) iconEl.textContent = state.sortDesc ? '↓' : '↑';
    loadData(1);
};
