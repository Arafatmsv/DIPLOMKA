/**
 * Users Management (Пользователи) page logic
 * Admin-only: Full CRUD for user accounts & permissions
 */

let usersData = [];

// Module definitions for the permissions UI
const MODULES = [
    {
        key: 'users',
        label: 'Управление пользователями',
        icon: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>',
        actions: ['Create', 'Read', 'Update', 'Delete']
    },
    {
        key: 'dictionaries',
        label: 'Справочники (Регионы / Продукты)',
        icon: '<path d="M4 4h6l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6c0-1.1.9-2 2-2z" />',
        actions: ['Create', 'Read', 'Update', 'Delete']
    },
    {
        key: 'prices',
        label: 'Мониторинг цен (Наблюдения)',
        icon: '<path d="M7 7h.01M5.22 2.22l8.36.002c.53 0 1.04.21 1.41.59l7.41 7.41a2 2 0 010 2.83l-6.58 6.58a2 2 0 01-2.83 0l-7.41-7.41a2 2 0 01-.59-1.41V3.22a1 1 0 011-1z" />',
        actions: ['Create', 'Read', 'Update', 'Delete']
    },
    {
        key: 'audit_logs',
        label: 'Журнал аудита',
        icon: '<path d="M9 12h6M9 16h6M4 6v14a2 2 0 002 2h12a2 2 0 002-2V8l-6-6H6a2 2 0 00-2 2z" />',
        actions: ['Read']
    },
    {
        key: 'analytics',
        label: 'Аналитика и отчёты',
        icon: '<path d="M12 20V10M18 20V4M6 20v-4" />',
        actions: ['Create', 'Read', 'Update', 'Delete']
    },
    {
        key: 'feedback',
        label: 'Обратная связь',
        icon: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />',
        actions: ['Read', 'Delete']
    }
];

const ACTION_LABELS = {
    'Create': 'Создание',
    'Read': 'Чтение',
    'Update': 'Редакт.',
    'Delete': 'Удаление'
};

document.addEventListener('DOMContentLoaded', async () => {
    await loadUsers();
    setupUserEvents();
    setupPermEvents();
    setupDeleteEvents();
});

// ══════════════════════════════════════════
//  LOAD & RENDER USERS
// ══════════════════════════════════════════

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Загрузка...</td></tr>';

    try {
        usersData = await API.getUsers();
        renderUsers();
        updateStats();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Ошибка: ${err.message}</td></tr>`;
    }
}

function renderUsers() {
    const tbody = document.getElementById('usersTableBody');

    if (!usersData.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center empty-state">Нет пользователей.</td></tr>';
        return;
    }

    tbody.innerHTML = usersData.map(u => {
        const initials = getInitials(u.name || u.username);
        const roleClass = getRoleBadgeClass(u.role);
        const createdDate = u.created_at ? formatDate(u.created_at) : '—';
        const lastLogin = u.last_login_at ? formatDate(u.last_login_at) : '— не входил';

        return `
        <tr>
            <td>
                <div class="user-cell-info">
                    <div class="user-avatar">${initials}</div>
                    <div>
                        <div class="user-cell-name">${escapeHtml(u.name || u.username)}</div>
                        <div class="user-cell-username">@${escapeHtml(u.username)}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="user-role-badge ${roleClass}">
                    ${escapeHtml(u.role)}
                </span>
            </td>
            <td>
                <span class="user-status-dot ${u.is_active ? 'status-active' : 'status-inactive'}"></span>
                ${u.is_active ? 'Активен' : 'Неактивен'}
            </td>
            <td class="user-cell-date">${createdDate}</td>
            <td class="user-cell-date">${lastLogin}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-icon edit-action" onclick="editUserPerms(${u.id})" title="Настроить права">
                        <svg class="icon-action" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h.09a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.56.2 1.09.68 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                        </svg>
                    </button>
                    <button class="btn-icon edit-action" onclick="editUser(${u.id})" title="Редактировать">
                        <svg class="icon-action" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.89 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.89l12.675-12.687z"/>
                            <path d="M19.5 7.125L16.862 4.487"/>
                        </svg>
                    </button>
                    <button class="btn-icon delete-action" onclick="confirmDeleteUser(${u.id}, '${escapeHtml(u.name || u.username)}')" title="Удалить">
                        <svg class="icon-action" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

function updateStats() {
    document.getElementById('statTotal').textContent = usersData.length;
    document.getElementById('statAdmins').textContent = usersData.filter(u => u.role === 'Администратор').length;
    document.getElementById('statAnalysts').textContent = usersData.filter(u => u.role === 'Аналитик').length;
    document.getElementById('statOperators').textContent = usersData.filter(u => u.role === 'Оператор').length;
}

// ══════════════════════════════════════════
//  ADD / EDIT USER MODAL
// ══════════════════════════════════════════

function setupUserEvents() {
    const modal = document.getElementById('userModal');

    // Open Add
    document.getElementById('btnAddUser').addEventListener('click', () => {
        document.getElementById('userModalTitle').textContent = 'Добавить пользователя';
        document.getElementById('userId').value = '';
        document.getElementById('userName').value = '';
        document.getElementById('userLogin').value = '';
        document.getElementById('userPassword').value = '';
        document.getElementById('userRole').value = '';
        document.getElementById('passwordLabel').setAttribute('required', '');
        document.getElementById('userPassword').setAttribute('required', '');
        document.getElementById('userPassword').placeholder = 'Минимум 6 символов';
        modal.classList.remove('hidden');
        document.getElementById('userName').focus();
    });

    // Close
    document.getElementById('btnCloseUserModal').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('btnCancelUserModal').addEventListener('click', () => modal.classList.add('hidden'));

    // Save
    document.getElementById('btnSaveUser').addEventListener('click', async () => {
        const form = document.getElementById('userForm');
        if (!form.reportValidity()) return;

        const id = document.getElementById('userId').value;
        const name = document.getElementById('userName').value.trim();
        const username = document.getElementById('userLogin').value.trim();
        const password = document.getElementById('userPassword').value;
        const role = document.getElementById('userRole').value;

        if (!id && (!password || password.length < 6)) {
            showToast('Пароль должен содержать минимум 6 символов', 'error');
            return;
        }

        const btn = document.getElementById('btnSaveUser');
        btn.disabled = true;
        btn.textContent = 'Сохранение...';

        try {
            const defaultPerms = RBAC.getDefaultPermissions(role);

            if (id) {
                const payload = { name, username, role, permissions: defaultPerms };
                if (password) payload.password = password;
                await API.updateUser(id, payload);
                showToast('Пользователь обновлён');
            } else {
                await API.createUser({ name, username, password, role, permissions: defaultPerms });
                showToast('Пользователь создан');
            }
            modal.classList.add('hidden');
            await loadUsers();
        } catch (err) {
            showToast('Ошибка: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Сохранить';
        }
    });
}

window.editUser = function (id) {
    const user = usersData.find(u => u.id === id);
    if (!user) return;

    document.getElementById('userModalTitle').textContent = 'Редактировать пользователя';
    document.getElementById('userId').value = user.id;
    document.getElementById('userName').value = user.name || '';
    document.getElementById('userLogin').value = user.username;
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').removeAttribute('required');
    document.getElementById('passwordLabel').removeAttribute('required');
    document.getElementById('userPassword').placeholder = 'Оставьте пустым, чтобы не менять';
    document.getElementById('userRole').value = user.role;
    document.getElementById('userModal').classList.remove('hidden');
    document.getElementById('userName').focus();
};

// ══════════════════════════════════════════
//  PERMISSIONS MODAL (Checkbox Matrix)
// ══════════════════════════════════════════

function setupPermEvents() {
    const modal = document.getElementById('permModal');

    document.getElementById('btnClosePermModal').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('btnCancelPermModal').addEventListener('click', () => modal.classList.add('hidden'));

    // Role change auto-fills checkboxes
    document.getElementById('permRole').addEventListener('change', (e) => {
        const role = e.target.value;
        const defaults = RBAC.getDefaultPermissions(role);
        applyPermissionsToCheckboxes(defaults);
    });

    // Save permissions
    document.getElementById('btnSavePerms').addEventListener('click', async () => {
        const userId = document.getElementById('permUserId').value;
        const role = document.getElementById('permRole').value;
        const permissions = readPermissionsFromCheckboxes();

        const user = usersData.find(u => u.id == userId);
        if (!user) return;

        const btn = document.getElementById('btnSavePerms');
        btn.disabled = true;
        btn.textContent = 'Сохранение...';

        try {
            await API.updateUser(userId, {
                name: user.name,
                username: user.username,
                role: role,
                permissions: permissions
            });
            showToast('Права доступа обновлены');
            modal.classList.add('hidden');
            await loadUsers();
        } catch (err) {
            showToast('Ошибка: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Сохранить права';
        }
    });
}

window.editUserPerms = function (id) {
    const user = usersData.find(u => u.id === id);
    if (!user) return;

    document.getElementById('permModalTitle').textContent = `Права доступа — ${user.name || user.username}`;
    document.getElementById('permUserId').value = user.id;
    document.getElementById('permRole').value = user.role;

    // Build checkbox UI
    buildPermissionCheckboxes();

    // Apply current user permissions
    const perms = user.permissions || RBAC.getDefaultPermissions(user.role);
    applyPermissionsToCheckboxes(perms);

    document.getElementById('permModal').classList.remove('hidden');
};

function buildPermissionCheckboxes() {
    const container = document.getElementById('permCheckboxContainer');
    container.innerHTML = '';

    MODULES.forEach(mod => {
        const section = document.createElement('div');
        section.className = 'perm-section';

        section.innerHTML = `
            <div class="perm-section-title">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    ${mod.icon}
                </svg>
                ${mod.label}
            </div>
            <div class="perm-checkboxes">
                ${mod.actions.map(action => `
                    <div class="perm-checkbox-item">
                        <input type="checkbox" id="perm_${mod.key}_${action}" data-module="${mod.key}" data-action="${action}">
                        <label for="perm_${mod.key}_${action}">${ACTION_LABELS[action] || action}</label>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(section);
    });
}

function applyPermissionsToCheckboxes(permissions) {
    // Uncheck all first
    document.querySelectorAll('#permCheckboxContainer input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });

    // Check matching
    for (const [modKey, actions] of Object.entries(permissions)) {
        if (!Array.isArray(actions)) continue;
        actions.forEach(action => {
            const cb = document.getElementById(`perm_${modKey}_${action}`);
            if (cb) cb.checked = true;
        });
    }
}

function readPermissionsFromCheckboxes() {
    const permissions = {};

    MODULES.forEach(mod => {
        permissions[mod.key] = [];
        mod.actions.forEach(action => {
            const cb = document.getElementById(`perm_${mod.key}_${action}`);
            if (cb && cb.checked) {
                permissions[mod.key].push(action);
            }
        });
    });

    return permissions;
}

// ══════════════════════════════════════════
//  DELETE USER
// ══════════════════════════════════════════

function setupDeleteEvents() {
    const modal = document.getElementById('deleteUserModal');

    document.getElementById('btnCloseDeleteUserModal').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('btnCancelDeleteUser').addEventListener('click', () => modal.classList.add('hidden'));

    document.getElementById('btnConfirmDeleteUser').addEventListener('click', async () => {
        const id = document.getElementById('deleteUserId').value;
        const btn = document.getElementById('btnConfirmDeleteUser');

        btn.disabled = true;
        btn.textContent = 'Удаление...';

        try {
            await API.deleteUser(id);
            showToast('Пользователь деактивирован');
            modal.classList.add('hidden');
            await loadUsers();
        } catch (err) {
            showToast('Ошибка: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Удалить';
        }
    });
}

window.confirmDeleteUser = function (id, name) {
    document.getElementById('deleteUserId').value = id;
    document.getElementById('deleteUserName').textContent = name;
    document.getElementById('deleteUserModal').classList.remove('hidden');
};

// ══════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function getRoleBadgeClass(role) {
    switch (role) {
        case 'Администратор': return 'role-admin';
        case 'Аналитик': return 'role-analyst';
        case 'Оператор': return 'role-operator';
        default: return 'role-operator';
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
