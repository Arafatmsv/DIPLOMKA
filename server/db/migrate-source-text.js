// Migration: add source_text column to price_records
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run('ALTER TABLE price_records ADD COLUMN source_text TEXT', (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('Column source_text already exists, skipping.');
            } else {
                console.error('Error:', err.message);
            }
        } else {
            console.log('✅ Column source_text added to price_records');
        }

        db.close(() => {
            console.log('Database closed.');
            process.exit(0);
        });
    });
});
