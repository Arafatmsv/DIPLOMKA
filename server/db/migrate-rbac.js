const { dbRun, dbAll, dbGet } = require('./database');
const bcrypt = require('bcrypt');

/**
 * RBAC Migration Script
 * - Ensures users table has role, permissions, is_active columns
 * - Sets existing admin (ID=1) to Администратор with full CRUD
 * - Defaults all other users to Оператор
 * 
 * Full Permission Matrix:
 * ┌─────────────────────────────┬───────────────────┬──────────────┬──────────┐
 * │ Module                      │ Администратор     │ Аналитик     │ Оператор │
 * ├─────────────────────────────┼───────────────────┼──────────────┼──────────┤
 * │ users (Пользователи)        │ CRUD              │ —            │ —        │
 * │ dictionaries (Справочники)  │ CRUD              │ Read         │ Read     │
 * │ prices (Мониторинг цен)     │ Read,Update,Delete│ Read         │ C,Read   │
 * │ audit_logs (Журнал аудита)  │ Read              │ —            │ —        │
 * │ analytics (Аналитика)       │ CRUD              │ CRUD         │ —        │
 * │ feedback (Обратная связь)   │ Read,Delete       │ Read         │ —        │
 * └─────────────────────────────┴───────────────────┴──────────────┴──────────┘
 */

const ROLE_PERMISSIONS = {
    'Администратор': {
        users: ['Create', 'Read', 'Update', 'Delete'],
        dictionaries: ['Create', 'Read', 'Update', 'Delete'],
        prices: ['Read', 'Update', 'Delete'],
        audit_logs: ['Read'],
        analytics: ['Create', 'Read', 'Update', 'Delete'],
        feedback: ['Read', 'Delete']
    },
    'Аналитик': {
        users: [],
        dictionaries: ['Read'],
        prices: ['Read'],
        audit_logs: [],
        analytics: ['Create', 'Read', 'Update', 'Delete'],
        feedback: ['Read']
    },
    'Оператор': {
        users: [],
        dictionaries: ['Read'],
        prices: ['Create', 'Read'],
        audit_logs: [],
        analytics: [],
        feedback: []
    }
};

async function migrate() {
    console.log('═══════════════════════════════════════');
    console.log('  RBAC Migration — Full Permission Matrix');
    console.log('═══════════════════════════════════════');

    // Get current columns in users table
    const tableInfo = await dbAll("PRAGMA table_info(users)");
    const columns = tableInfo.map(col => col.name);

    console.log('Current columns:', columns.join(', '));

    // Ensure columns exist
    if (columns.includes('email') && !columns.includes('username')) {
        console.log('→ Renaming "email" to "username"...');
        try {
            await dbRun('ALTER TABLE users RENAME COLUMN email TO username');
        } catch (e) {
            console.error("Could not rename column:", e.message);
        }
    }

    if (!columns.includes('permissions')) {
        console.log('→ Adding "permissions" column...');
        await dbRun('ALTER TABLE users ADD COLUMN permissions TEXT');
    }

    if (!columns.includes('role')) {
        console.log('→ Adding "role" column...');
        await dbRun("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'Оператор'");
    }

    if (!columns.includes('is_active')) {
        console.log('→ Adding "is_active" column...');
        await dbRun('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1');
    }

    if (!columns.includes('last_login_at')) {
        console.log('→ Adding "last_login_at" column...');
        await dbRun('ALTER TABLE users ADD COLUMN last_login_at DATETIME');
    }

    if (!columns.includes('updated_at')) {
        console.log('→ Adding "updated_at" column...');
        await dbRun("ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
    }

    // Update existing users
    console.log('\nUpdating user roles and permissions...');
    const users = await dbAll('SELECT id, username, role FROM users');

    for (let u of users) {
        // ID=1 or known admin patterns → Администратор
        if (u.id === 1 || u.role === 'Admin' || u.role === 'Администратор' || u.username === 'admin@example.com' || u.username === 'admin') {
            const role = 'Администратор';
            const perms = JSON.stringify(ROLE_PERMISSIONS[role]);
            let newUsername = u.username;

            if (u.username === 'admin@example.com') {
                newUsername = 'admin';
                const hash = await bcrypt.hash('Admin123!', 10);
                await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [hash, u.id]);
            }

            await dbRun('UPDATE users SET username = ?, role = ?, permissions = ?, is_active = 1 WHERE id = ?',
                [newUsername, role, perms, u.id]
            );
            console.log(`  ✅ User #${u.id} (${newUsername}) → ${role}`);
        } else {
            // All others → Оператор
            const role = 'Оператор';
            const perms = JSON.stringify(ROLE_PERMISSIONS[role]);
            await dbRun('UPDATE users SET role = ?, permissions = ?, is_active = 1 WHERE id = ?',
                [role, perms, u.id]
            );
            console.log(`  ✅ User #${u.id} (${u.username}) → ${role}`);
        }
    }

    console.log('\n═══════════════════════════════════════');
    console.log('  Migration complete!');
    console.log('═══════════════════════════════════════');
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
}).finally(() => {
    process.exit(0);
});
