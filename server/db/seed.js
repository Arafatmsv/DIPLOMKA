const bcrypt = require('bcrypt');
const { initDb, dbRun, dbGet } = require('./database');

async function seed() {
    console.log('Initializing database schema...');
    await initDb();

    console.log('Checking for existing Admin user...');
    const existingAdmin = await dbGet(`SELECT id FROM users WHERE email = ?`, ['admin@example.com']);

    if (!existingAdmin) {
        console.log('Seeding default Admin user...');
        const hash = await bcrypt.hash('Admin123!', 10);
        await dbRun(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
            ['Super Admin', 'admin@example.com', hash, 'Admin']
        );
    }

    // Seed default settings
    const checkSetting = await dbGet(`SELECT key FROM settings WHERE key = 'last_updated_date'`);
    if (!checkSetting) {
        console.log('Seeding default settings...');
        await dbRun(`INSERT INTO settings (key, value) VALUES (?, ?)`, ['last_updated_date', new Date().toISOString().split('T')[0]]);
        await dbRun(`INSERT INTO settings (key, value) VALUES (?, ?)`, ['deviation_threshold_pct', '5']);
    }

    // Seed basic regions and products if empty
    const regionCount = await dbGet(`SELECT COUNT(*) as c FROM regions`);
    if (regionCount.c === 0) {
        console.log('Seeding regions...');
        const regions = ['г. Бишкек', 'г. Ош', 'Чуйская обл.', 'Ошская обл.', 'Джалал-Абадская обл.', 'Иссык-Кульская обл.', 'Нарынская обл.', 'Таласская обл.', 'Баткенская обл.'];
        for (const r of regions) await dbRun(`INSERT INTO regions (name, is_active) VALUES (?, 1)`, [r]);
    }

    const productCount = await dbGet(`SELECT COUNT(*) as c FROM products`);
    if (productCount.c === 0) {
        console.log('Seeding products...');
        const products = [
            { name: 'Хлеб пшеничный', cat: 'Хлебобулочные', unit: 'булка' },
            { name: 'Мука 1 сорт', cat: 'Мука', unit: 'кг' },
            { name: 'Сахар', cat: 'Сахар', unit: 'кг' },
            { name: 'Мясо говядина', cat: 'Мясо', unit: 'кг' },
            { name: 'Масло подсолнечное', cat: 'Масла', unit: 'литр' },
            { name: 'Яйца', cat: 'Яйца', unit: '10 шт' }
        ];
        for (const p of products) await dbRun(`INSERT INTO products (name, category, unit, is_active) VALUES (?, ?, ?, 1)`, [p.name, p.cat, p.unit]);
    }

    const sourceCount = await dbGet(`SELECT COUNT(*) as c FROM sources`);
    if (sourceCount.c === 0) {
        console.log('Seeding sources...');
        const sources = ['Рынок Ошский', 'Глобус', 'Народный', 'Рынок Орто-Сай'];
        for (const s of sources) await dbRun(`INSERT INTO sources (name, type, is_active) VALUES (?, 'Retail', 1)`, [s]);
    }

    console.log('Seeding complete.');
}

seed().catch(err => {
    console.error('Seed failed:', err);
}).finally(() => {
    process.exit();
});
