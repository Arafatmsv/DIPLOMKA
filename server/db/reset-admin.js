const { initDb, dbRun, dbGet } = require('./database');
const bcrypt = require('bcrypt');

const ROLE_PERMISSIONS = {
    'Администратор': {
        users: ['Create', 'Read', 'Update', 'Delete'],
        dictionaries: ['Create', 'Read', 'Update', 'Delete'],
        prices: ['Read', 'Update', 'Delete'],
        audit_logs: ['Read'],
        analytics: ['Create', 'Read', 'Update', 'Delete'],
        feedback: ['Read', 'Delete']
    }
};

async function resetAdmin() {
    await initDb();
    
    const username = 'admin@example.com';
    const plainPassword = 'admin123';
    const numHash = await bcrypt.hash(plainPassword, 10);
    const role = 'Администратор';
    const perms = JSON.stringify(ROLE_PERMISSIONS[role]);

    const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);

    if (user) {
        console.log(`User ${username} exists. Updating...`);
        await dbRun(
            'UPDATE users SET password_hash = ?, role = ?, permissions = ?, is_active = 1 WHERE id = ?',
            [numHash, role, perms, user.id]
        );
        console.log('Update complete.');
    } else {
        console.log(`User ${username} does not exist. Creating...`);
        await dbRun(
            'INSERT INTO users (name, username, password_hash, role, permissions, is_active) VALUES (?, ?, ?, ?, ?, 1)',
            ['Главный Администратор', username, numHash, role, perms]
        );
        console.log('User created.');
    }
}

resetAdmin().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
