/**
 * Seed sample price records for testing
 */
const bcrypt = require('bcrypt');
const { initDb, dbRun, dbGet, dbAll } = require('./database');

async function seedPrices() {
    console.log('Initializing database...');
    await initDb();

    // Check if price records already exist
    const existing = await dbGet(`SELECT COUNT(*) as c FROM price_records WHERE is_deleted = 0`);
    if (existing.c > 0) {
        console.log(`Already have ${existing.c} price records. Skipping price seeding.`);
        return;
    }

    // Get regions, products and sources
    const regions = await dbAll(`SELECT id, name FROM regions`);
    const products = await dbAll(`SELECT id, name, unit FROM products`);
    const sources = await dbAll(`SELECT id, name FROM sources`);

    if (regions.length === 0 || products.length === 0) {
        console.error('No regions or products found. Run seed.js first.');
        return;
    }

    // Ensure admin user exists (id = 1)
    const admin = await dbGet(`SELECT id FROM users LIMIT 1`);
    const adminId = admin ? admin.id : null;

    console.log('Seeding sample price records...');

    // Sample prices for each product (realistic KGS prices)
    const basePrices = {
        'Хлеб пшеничный': 25,
        'Мука 1 сорт': 42,
        'Сахар': 85,
        'Мясо говядина': 550,
        'Масло подсолнечное': 140,
        'Яйца': 115,
    };

    const dates = [
        '2026-04-06', '2026-04-05', '2026-04-04', '2026-04-03',
        '2026-04-02', '2026-04-01', '2026-03-31', '2026-03-30',
    ];

    let count = 0;

    for (const date of dates) {
        for (const region of regions) {
            for (const product of products) {
                const basePrice = basePrices[product.name] || 50;
                // Add random variation per region/date ±10%
                const variation = (Math.random() - 0.5) * 0.2;
                const price = Math.round((basePrice * (1 + variation)) * 100) / 100;

                // Calculate change from a simulated previous price
                const prevVariation = (Math.random() - 0.5) * 0.1;
                const changePct = Math.round(prevVariation * 1000) / 10; // e.g., -3.2, +1.5

                const sourceId = sources.length > 0 ? sources[Math.floor(Math.random() * sources.length)].id : null;

                await dbRun(
                    `INSERT INTO price_records (date, region_id, product_id, unit, price_som, change_pct, source_id, notes, created_by, updated_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [date, region.id, product.id, product.unit, price, changePct, sourceId, null, adminId, adminId]
                );
                count++;
            }
        }
    }

    console.log(`✅ Inserted ${count} price records.`);
}

seedPrices().catch(err => {
    console.error('Price seed failed:', err);
}).finally(() => {
    process.exit();
});
