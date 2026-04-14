/**
 * Dictionaries (Справочники) page logic
 * CRUD for Regions and Products
 */

let regionsData = [];
let productsData = [];

let regionsSort = { col: 'id', desc: false };
let productsSort = { col: 'id', desc: false };

document.addEventListener('DOMContentLoaded', async () => {
    // Load data
    await loadRegions();
    await loadProducts();

    // Setup tabs
    setupTabs();

    // Setup event listeners
    setupRegionEvents();
    setupProductEvents();
    setupDeleteEvents();
});

// ══════════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════════

function setupTabs() {
    document.querySelectorAll('.dict-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Update tab active state
            document.querySelectorAll('.dict-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show/hide panels
            const tabName = tab.getAttribute('data-tab');
            document.querySelectorAll('.dict-panel').forEach(p => p.classList.add('hidden'));
            document.getElementById(`panel${tabName === 'regions' ? 'Regions' : 'Products'}`).classList.remove('hidden');
        });
    });
}

// ══════════════════════════════════════════════
//  REGIONS
// ══════════════════════════════════════════════

async function loadRegions() {
    const tbody = document.getElementById('regionsTableBody');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center">Загрузка...</td></tr>';

    try {
        const order = regionsSort.desc ? 'desc' : 'asc';
        regionsData = await API.getRegions({ sortBy: regionsSort.col, sortOrder: order });
        renderRegions();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Ошибка: ${err.message}</td></tr>`;
    }
}

function renderRegions() {
    const tbody = document.getElementById('regionsTableBody');

    if (!regionsData.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-state">Нет регионов. Добавьте первый.</td></tr>';
        return;
    }

    const editAttrs = (typeof RBAC !== 'undefined') ? RBAC.getActionBtnAttrs('dictionaries', 'Update') : '';
    const deleteAttrs = (typeof RBAC !== 'undefined') ? RBAC.getActionBtnAttrs('dictionaries', 'Delete') : '';

    tbody.innerHTML = regionsData.map(r => `
        <tr>
            <td class="text-muted">${r.id}</td>
            <td class="font-medium">${r.name}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-icon edit-action" onclick="editRegion(${r.id})" title="Редактировать" ${editAttrs}>
                        <svg class="icon-action" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.89 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.89l12.675-12.687z"/>
                            <path d="M19.5 7.125L16.862 4.487"/>
                        </svg>
                    </button>
                    <button class="btn-icon delete-action" onclick="confirmDeleteDict('region', ${r.id}, '${r.name.replace(/'/g, "\\'")}')" title="Удалить" ${deleteAttrs}>
                        <svg class="icon-action" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function setupRegionEvents() {
    // Open Add modal
    document.getElementById('btnAddRegion').addEventListener('click', () => {
        document.getElementById('regionModalTitle').textContent = 'Добавить регион';
        document.getElementById('regionId').value = '';
        document.getElementById('regionName').value = '';
        document.getElementById('regionModal').classList.remove('hidden');
        document.getElementById('regionName').focus();
    });

    // Close modal
    document.getElementById('btnCloseRegionModal').addEventListener('click', () => {
        document.getElementById('regionModal').classList.add('hidden');
    });
    document.getElementById('btnCancelRegionModal').addEventListener('click', () => {
        document.getElementById('regionModal').classList.add('hidden');
    });

    // Save
    document.getElementById('btnSaveRegion').addEventListener('click', async () => {
        const form = document.getElementById('regionForm');
        if (!form.reportValidity()) return;

        const id = document.getElementById('regionId').value;
        const name = document.getElementById('regionName').value.trim();
        const btn = document.getElementById('btnSaveRegion');

        btn.disabled = true;
        btn.textContent = 'Сохранение...';

        try {
            if (id) {
                await API.updateRegion(id, { name });
                showToast('Регион обновлён');
            } else {
                await API.createRegion({ name });
                showToast('Регион добавлен');
            }
            document.getElementById('regionModal').classList.add('hidden');
            await loadRegions();
        } catch (err) {
            showToast('Ошибка: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Сохранить';
        }
    });
}

window.editRegion = function (id) {
    const region = regionsData.find(r => r.id === id);
    if (!region) return;

    document.getElementById('regionModalTitle').textContent = 'Редактировать регион';
    document.getElementById('regionId').value = region.id;
    document.getElementById('regionName').value = region.name;
    document.getElementById('regionModal').classList.remove('hidden');
    document.getElementById('regionName').focus();
};

// ══════════════════════════════════════════════
//  PRODUCTS
// ══════════════════════════════════════════════

async function loadProducts() {
    const tbody = document.getElementById('productsTableBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Загрузка...</td></tr>';

    try {
        const order = productsSort.desc ? 'desc' : 'asc';
        productsData = await API.getProducts({ sortBy: productsSort.col, sortOrder: order });
        renderProducts();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Ошибка: ${err.message}</td></tr>`;
    }
}

function renderProducts() {
    const tbody = document.getElementById('productsTableBody');

    if (!productsData.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center empty-state">Нет продуктов. Добавьте первый.</td></tr>';
        return;
    }

    const editAttrs = (typeof RBAC !== 'undefined') ? RBAC.getActionBtnAttrs('dictionaries', 'Update') : '';
    const deleteAttrs = (typeof RBAC !== 'undefined') ? RBAC.getActionBtnAttrs('dictionaries', 'Delete') : '';

    tbody.innerHTML = productsData.map(p => `
        <tr>
            <td class="text-muted">${p.id}</td>
            <td class="font-medium">${p.name}</td>
            <td>${p.unit || '—'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-icon edit-action" onclick="editProduct(${p.id})" title="Редактировать" ${editAttrs}>
                        <svg class="icon-action" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.89 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.89l12.675-12.687z"/>
                            <path d="M19.5 7.125L16.862 4.487"/>
                        </svg>
                    </button>
                    <button class="btn-icon delete-action" onclick="confirmDeleteDict('product', ${p.id}, '${p.name.replace(/'/g, "\\'")}')" title="Удалить" ${deleteAttrs}>
                        <svg class="icon-action" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function setupProductEvents() {
    // Open Add modal
    document.getElementById('btnAddProduct').addEventListener('click', () => {
        document.getElementById('productModalTitle').textContent = 'Добавить продукт';
        document.getElementById('productId').value = '';
        document.getElementById('productName').value = '';
        document.getElementById('productUnit').value = '';
        document.getElementById('productModal').classList.remove('hidden');
        document.getElementById('productName').focus();
    });

    // Close modal
    document.getElementById('btnCloseProductModal').addEventListener('click', () => {
        document.getElementById('productModal').classList.add('hidden');
    });
    document.getElementById('btnCancelProductModal').addEventListener('click', () => {
        document.getElementById('productModal').classList.add('hidden');
    });

    // Save
    document.getElementById('btnSaveProduct').addEventListener('click', async () => {
        const form = document.getElementById('productForm');
        if (!form.reportValidity()) return;

        const id = document.getElementById('productId').value;
        const name = document.getElementById('productName').value.trim();
        const unit = document.getElementById('productUnit').value.trim();
        const btn = document.getElementById('btnSaveProduct');

        btn.disabled = true;
        btn.textContent = 'Сохранение...';

        try {
            if (id) {
                await API.updateProduct(id, { name, unit });
                showToast('Продукт обновлён');
            } else {
                await API.createProduct({ name, unit });
                showToast('Продукт добавлен');
            }
            document.getElementById('productModal').classList.add('hidden');
            await loadProducts();
        } catch (err) {
            showToast('Ошибка: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Сохранить';
        }
    });
}

window.editProduct = function (id) {
    const product = productsData.find(p => p.id === id);
    if (!product) return;

    document.getElementById('productModalTitle').textContent = 'Редактировать продукт';
    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productUnit').value = product.unit || '';
    document.getElementById('productModal').classList.remove('hidden');
    document.getElementById('productName').focus();
};

// ══════════════════════════════════════════════
//  DELETE (shared for both regions & products)
// ══════════════════════════════════════════════

window.confirmDeleteDict = function (type, id, name) {
    document.getElementById('dictDeleteType').value = type;
    document.getElementById('dictDeleteId').value = id;
    document.getElementById('dictDeleteName').textContent = name;
    document.getElementById('dictDeleteModal').classList.remove('hidden');
};

function setupDeleteEvents() {
    document.getElementById('btnCloseDictDelete').addEventListener('click', closeDictDelete);
    document.getElementById('btnCancelDictDelete').addEventListener('click', closeDictDelete);

    document.getElementById('btnConfirmDictDelete').addEventListener('click', async () => {
        const type = document.getElementById('dictDeleteType').value;
        const id = document.getElementById('dictDeleteId').value;
        const btn = document.getElementById('btnConfirmDictDelete');

        btn.disabled = true;
        btn.textContent = 'Удаление...';

        try {
            if (type === 'region') {
                await API.deleteRegion(id);
                showToast('Регион удалён');
                await loadRegions();
            } else {
                await API.deleteProduct(id);
                showToast('Продукт удалён');
                await loadProducts();
            }
            closeDictDelete();
        } catch (err) {
            showToast('Ошибка удаления: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Удалить';
        }
    });
}

function closeDictDelete() {
    document.getElementById('dictDeleteModal').classList.add('hidden');
}

// ══════════════════════════════════════════════
//  SORTING
// ══════════════════════════════════════════════

window.sortRegions = function(col) {
    if (regionsSort.col === col) {
        regionsSort.desc = !regionsSort.desc;
    } else {
        regionsSort.col = col;
        regionsSort.desc = false;
    }
    // Update arrow indicators
    document.querySelectorAll('#panelRegions .sort-arrow').forEach(el => el.textContent = '');
    const iconEl = document.getElementById(`sort-region-${col}`);
    if (iconEl) iconEl.textContent = regionsSort.desc ? '↓' : '↑';
    loadRegions();
};

window.sortProducts = function(col) {
    if (productsSort.col === col) {
        productsSort.desc = !productsSort.desc;
    } else {
        productsSort.col = col;
        productsSort.desc = false;
    }
    // Update arrow indicators
    document.querySelectorAll('#panelProducts .sort-arrow').forEach(el => el.textContent = '');
    const iconEl = document.getElementById(`sort-product-${col}`);
    if (iconEl) iconEl.textContent = productsSort.desc ? '↓' : '↑';
    loadProducts();
};
