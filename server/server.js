console.log("✅ LOADED: server/server.js", __filename);

const path = require("path");
const express = require("express");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const csvParser = require("csv-parser");
const { stringify: csvStringify } = require("csv-stringify/sync");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_change_in_production";

// Security headers
app.use(
    helmet({
        contentSecurityPolicy: false, // Allow inline scripts/styles for simplicity in this project if needed
    })
);

app.use(express.json());
app.use(cookieParser());

// Rate limiting for login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 login requests per window
    message: { error: "Слишком много попыток входа, пожалуйста, попробуйте позже." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Setup multer for CSV uploads
const upload = multer({ dest: "uploads/" });

// DB helpers
const { dbGet, dbAll, dbRun, initDb } = require("./db/database");

// Initialize DB tables on startup
initDb().then(() => {
    console.log("✅ Database initialized (tables ready)");
}).catch(err => {
    console.error("❌ Database init failed:", err);
    process.exit(1);
});

// --- Auth Middleware ---
const authenticate = async (req, res, next) => {
    const token = req.cookies.admin_token;
    if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await dbGet(`SELECT id, name, username, role, permissions FROM users WHERE id = ? AND is_active = 1`, [
            decoded.id,
        ]);
        if (!user) {
            return res.status(401).json({ error: "Invalid user" });
        }
        if (typeof user.permissions === 'string') {
            try { user.permissions = JSON.parse(user.permissions); } catch(e) { user.permissions = {}; }
        } else {
            user.permissions = user.permissions || {};
        }
        req.user = user;
        next();
    } catch (ex) {
        return res.status(401).json({ error: "Invalid token" });
    }
};

const checkAccess = (moduleName, action) => {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        if (req.user.role === 'Администратор') return next(); // Admin always bypasses
        
        const modPerms = req.user.permissions[moduleName] || [];
        if (modPerms.includes(action)) {
            return next();
        }
        return res.status(403).json({ error: "Недостаточно прав для выполнения действия" });
    };
};

// --- Auth API ---
app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Логин и пароль обязательны" });
    }

    try {
        const user = await dbGet(`SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND is_active = 1`, [username]);
        if (!user) {
            return res.status(401).json({ error: "Неверный логин или пароль" });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: "Неверный логин или пароль" });
        }

        // Create token
        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
            expiresIn: "8h",
        });

        // Set HTTP-only cookie
        res.cookie("admin_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 8 * 60 * 60 * 1000, // 8 hours
            sameSite: "lax",
        });

        // Update last login
        await dbRun(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);

        let perms = user.permissions;
        if (typeof perms === 'string') {
            try { perms = JSON.parse(perms); } catch(e) { perms = {}; }
        }

        res.json({ message: "Успешный вход", user: { name: user.name, username: user.username, role: user.role, permissions: perms } });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
});

app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("admin_token");
    res.json({ message: "Успешный выход" });
});

app.get("/api/me", authenticate, (req, res) => {
    res.json({ user: req.user });
});

// ---- API: Directories (Regions, Products, Sources) ----

// --- REGIONS CRUD ---
app.get("/api/regions", async (req, res) => {
    try {
        const { sortBy = "name", sortOrder = "asc" } = req.query;
        const validCols = { id: "id", name: "name" };
        const col = validCols[sortBy] || "name";
        const dir = sortOrder.toLowerCase() === "desc" ? "DESC" : "ASC";
        const rows = await dbAll(`SELECT id, name FROM regions WHERE is_active = 1 ORDER BY ${col} ${dir}`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/regions", authenticate, checkAccess('dictionaries', 'Create'), async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Название региона обязательно" });
        }
        const { id } = await dbRun(`INSERT INTO regions (name, is_active) VALUES (?, 1)`, [name.trim()]);
        res.status(201).json({ message: "Регион добавлен", id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/regions/:id", authenticate, checkAccess('dictionaries', 'Update'), async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Название региона обязательно" });
        }
        await dbRun(`UPDATE regions SET name = ? WHERE id = ?`, [name.trim(), req.params.id]);
        res.json({ message: "Регион обновлён" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/regions/:id", authenticate, checkAccess('dictionaries', 'Delete'), async (req, res) => {
    try {
        await dbRun(`UPDATE regions SET is_active = 0 WHERE id = ?`, [req.params.id]);
        res.json({ message: "Регион удалён" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PRODUCTS CRUD ---
app.get("/api/products", async (req, res) => {
    try {
        const { sortBy = "name", sortOrder = "asc" } = req.query;
        const validCols = { id: "id", name: "name", unit: "unit" };
        const col = validCols[sortBy] || "name";
        const dir = sortOrder.toLowerCase() === "desc" ? "DESC" : "ASC";
        const rows = await dbAll(
            `SELECT id, name, category, unit FROM products WHERE is_active = 1 ORDER BY ${col} ${dir}`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/products", authenticate, checkAccess('dictionaries', 'Create'), async (req, res) => {
    try {
        const { name, unit } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Название продукта обязательно" });
        }
        const { id } = await dbRun(
            `INSERT INTO products (name, category, unit, is_active) VALUES (?, ?, ?, 1)`,
            [name.trim(), null, (unit || "").trim() || null]
        );
        res.status(201).json({ message: "Продукт добавлен", id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/products/:id", authenticate, checkAccess('dictionaries', 'Update'), async (req, res) => {
    try {
        const { name, unit } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Название продукта обязательно" });
        }
        await dbRun(`UPDATE products SET name = ?, unit = ? WHERE id = ?`, [
            name.trim(),
            (unit || "").trim() || null,
            req.params.id,
        ]);
        res.json({ message: "Продукт обновлён" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/products/:id", authenticate, checkAccess('dictionaries', 'Delete'), async (req, res) => {
    try {
        await dbRun(`UPDATE products SET is_active = 0 WHERE id = ?`, [req.params.id]);
        res.json({ message: "Продукт удалён" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SOURCES (read-only, kept for backward compat) ---
app.get("/api/sources", async (req, res) => {
    try {
        const rows = await dbAll(`SELECT id, name, type FROM sources WHERE is_active = 1 ORDER BY name`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- API: Price Records ----

// GET - List prices (public, but admin uses it too with more filters)
app.get("/api/price-records", async (req, res) => {
    try {
        const {
            q,
            region,
            product,
            date_from,
            date_to,
            sort = "date DESC",
            page = 1,
            limit = 50,
            include_deleted = "false",
        } = req.query;

        const queryParams = [];
        const conditions = [];

        if (include_deleted !== "true") {
            conditions.push("pr.is_deleted = 0");
        }

        if (q) {
            conditions.push(`(r.name LIKE ? OR p.name LIKE ? OR COALESCE(pr.source_text, s.name, '') LIKE ?)`);
            const searchParam = `%${q}%`;
            queryParams.push(searchParam, searchParam, searchParam);
        }

        if (region) {
            conditions.push("pr.region_id = ?");
            queryParams.push(region);
        }
        if (product) {
            conditions.push("pr.product_id = ?");
            queryParams.push(product);
        }
        if (date_from) {
            conditions.push("pr.date >= ?");
            queryParams.push(date_from);
        }
        if (date_to) {
            conditions.push("pr.date <= ?");
            queryParams.push(date_to);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        // Define valid sort fields to prevent SQL injection
        const validSortFields = {
            "date ASC": "pr.date ASC",
            "date DESC": "pr.date DESC",
            "price ASC": "pr.price_som ASC",
            "price DESC": "pr.price_som DESC",
            "change ASC": "pr.change_pct ASC",
            "change DESC": "pr.change_pct DESC",
            "region ASC": "r.name ASC",
            "region DESC": "r.name DESC",
            "product ASC": "p.name ASC",
            "product DESC": "p.name DESC",
        };
        const orderByClause = validSortFields[sort] || "pr.date DESC";

        const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

        const countSql = `
      SELECT COUNT(*) as total 
      FROM price_records pr
      LEFT JOIN regions r ON pr.region_id = r.id
      LEFT JOIN products p ON pr.product_id = p.id
      LEFT JOIN sources s ON pr.source_id = s.id
      ${whereClause}
    `;

        const dataSql = `
      SELECT 
        pr.id, pr.date, pr.price_som, pr.change_pct, pr.unit, pr.notes,
        pr.source_text,
        r.id as region_id, r.name as region_name,
        p.id as product_id, p.name as product_name, p.category as product_category,
        s.id as source_id, s.name as source_name
      FROM price_records pr
      LEFT JOIN regions r ON pr.region_id = r.id
      LEFT JOIN products p ON pr.product_id = p.id
      LEFT JOIN sources s ON pr.source_id = s.id
      ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;

        const tc = await dbGet(countSql, queryParams);
        const rows = await dbAll(dataSql, queryParams);

        res.json({
            data: rows,
            meta: {
                total: tc.total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(tc.total / parseInt(limit)),
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Calculate percentage change based on previous record
async function calculateChangePct(regionId, productId, newDate, newPrice) {
    const prevRecord = await dbGet(
        `SELECT price_som FROM price_records 
     WHERE region_id = ? AND product_id = ? AND date < ? AND is_deleted = 0
     ORDER BY date DESC LIMIT 1`,
        [regionId, productId, newDate]
    );

    if (prevRecord && prevRecord.price_som > 0) {
        return ((newPrice - prevRecord.price_som) / prevRecord.price_som) * 100;
    }
    return 0;
}

// POST - Create
app.post("/api/price-records", authenticate, checkAccess('prices', 'Create'), async (req, res) => {
    try {
        const { date, region_id, product_id, source_id, source_text, price_som, notes } = req.body;
        let { change_pct } = req.body;

        if (!date || !region_id || !product_id || price_som === undefined || price_som < 0) {
            return res.status(400).json({ error: "Missing or invalid required fields" });
        }

        // Getting product unit
        const prod = await dbGet(`SELECT unit FROM products WHERE id = ?`, [product_id]);
        const unit = prod ? prod.unit : null;

        if (change_pct === undefined || change_pct === null || change_pct === "") {
            change_pct = await calculateChangePct(region_id, product_id, date, price_som);
        }

        const { id } = await dbRun(
            `INSERT INTO price_records (date, region_id, product_id, unit, price_som, change_pct, source_id, source_text, notes, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [date, region_id, product_id, unit, price_som, change_pct, source_id || null, source_text || null, notes, req.user.id, req.user.id]
        );

        res.status(201).json({ message: "Record created successfully", id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT - Update
app.put("/api/price-records/:id", authenticate, checkAccess('prices', 'Update'), async (req, res) => {
    try {
        const id = req.params.id;
        const { date, region_id, product_id, source_id, source_text, price_som, change_pct, notes } = req.body;

        if (!date || !region_id || !product_id || price_som === undefined || price_som < 0) {
            return res.status(400).json({ error: "Missing or invalid required fields" });
        }

        // --- Backdated Edit Logic with Audit ---
        const oldRecord = await dbGet(`SELECT * FROM price_records WHERE id = ?`, [id]);
        if (!oldRecord) return res.status(404).json({ error: "Record not found" });

        const isBackdated = new Date(date) < new Date(new Date().setHours(0, 0, 0, 0));
        
        // Even though only Admin reaches here via checkAccess mapping typically, we strictly enforce it
        if (isBackdated && req.user.role !== 'Администратор') {
            return res.status(403).json({ error: "Только Администратор может редактировать цены задним числом." });
        }

        const prod = await dbGet(`SELECT unit FROM products WHERE id = ?`, [product_id]);
        const unit = prod ? prod.unit : null;

        let finalChangePct = change_pct;
        if (finalChangePct === undefined || finalChangePct === null || finalChangePct === "") {
            finalChangePct = await calculateChangePct(region_id, product_id, date, price_som);
        }

        await dbRun(
            `UPDATE price_records SET 
        date = ?, region_id = ?, product_id = ?, unit = ?, 
        price_som = ?, change_pct = ?, source_id = ?, source_text = ?, notes = ?, 
        updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
            [date, region_id, product_id, unit, price_som, finalChangePct, source_id || null, source_text || null, notes, req.user.id, id]
        );

        if (isBackdated) {
            const diffJson = JSON.stringify({
                old_price: oldRecord.price_som,
                new_price: price_som,
                username: req.user.username,
                timestamp: new Date().toISOString(),
                record_id: id
            });
            await dbRun(
                `INSERT INTO audit_logs (user_id, action, entity, entity_id, diff_json) VALUES (?, ?, ?, ?, ?)`,
                [req.user.id, 'BACKDATED_PRICE_EDIT', 'price_records', id, diffJson]
            );
        }

        res.json({ message: "Record updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE - Soft Delete
app.delete("/api/price-records/:id", authenticate, checkAccess('prices', 'Delete'), async (req, res) => {
    try {
        await dbRun(
            `UPDATE price_records SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
            [req.user.id, req.params.id]
        );
        res.json({ message: "Record deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- CSV Export / Import ----

app.get("/api/price-records-export-csv", authenticate, async (req, res) => {
    try {
        const { region, product, date_from, date_to } = req.query;

        const queryParams = [];
        const conditions = ["pr.is_deleted = 0"];

        if (region) {
            conditions.push("pr.region_id = ?");
            queryParams.push(region);
        }
        if (product) {
            conditions.push("pr.product_id = ?");
            queryParams.push(product);
        }
        if (date_from) {
            conditions.push("pr.date >= ?");
            queryParams.push(date_from);
        }
        if (date_to) {
            conditions.push("pr.date <= ?");
            queryParams.push(date_to);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const dataSql = `
      SELECT 
        pr.date as Date,
        r.name as Region,
        p.name as Product,
        pr.price_som as Price,
        pr.change_pct as ChangePercent,
        s.name as Source,
        pr.notes as Notes
      FROM price_records pr
      LEFT JOIN regions r ON pr.region_id = r.id
      LEFT JOIN products p ON pr.product_id = p.id
      LEFT JOIN sources s ON pr.source_id = s.id
      ${whereClause}
      ORDER BY pr.date DESC
    `;

        const rows = await dbAll(dataSql, queryParams);
        const csvContent = csvStringify(rows, { header: true });

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="prices_export.csv"');
        res.status(200).send(csvContent);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================================
// BULK Excel/JSON Import
// ======================================
app.post("/api/prices/bulk", authenticate, async (req, res) => {
    if (!req.body || !Array.isArray(req.body.records)) {
        return res.status(400).json({ error: "Invalid payload. Expected { records: [...] }" });
    }

    const { records } = req.body;
    if (records.length === 0) return res.json({ message: "No records to import" });

    const errors = [];
    let insertedCount = 0;

    try {
        await dbRun("BEGIN TRANSACTION");

        // Helper maps
        let dbRegions = await dbAll("SELECT id, name FROM regions");
        let dbProducts = await dbAll("SELECT id, name FROM products");
        let dbSources = await dbAll("SELECT id, name FROM sources");

        let regionMap = dbRegions.reduce((acc, r) => ({ ...acc, [r.name.toLowerCase()]: r.id }), {});
        let productMap = dbProducts.reduce((acc, p) => ({ ...acc, [p.name.toLowerCase()]: p.id }), {});
        let sourceMap = dbSources.reduce((acc, s) => ({ ...acc, [s.name.toLowerCase()]: s.id }), {});

        let rowNumber = 0;

        for (const data of records) {
            rowNumber++;
            const regionName = (data.Region || data['Регион'] || "").trim();
            const productName = (data.Product || data['Продукт'] || "").trim();
            const sourceName = (data.Source || data['Источник'] || "Импорт").trim();
            const unitName = (data.Unit || data['Ед.изм'] || "").trim();
            
            const dateStr = (data.Date || data['Дата'] || "").trim();
            let priceVal = data.Price || data['Цена'] || data['Цена (сом)'];
            
            // Format price
            if (typeof priceVal === 'string') priceVal = parseFloat(priceVal.replace(",", "."));
            const price = parseFloat(priceVal);

            if (!dateStr || !regionName || !productName || isNaN(price) || price < 0) {
                errors.push(`Row ${rowNumber}: Invalid Data (Required: Date, Region, Product, Price)`);
                continue;
            }

            // Auto-create mappings if missing
            let regionId = regionMap[regionName.toLowerCase()];
            if (!regionId) {
                const resRegion = await dbRun("INSERT INTO regions (name) VALUES (?)", [regionName]);
                regionId = resRegion.lastID;
                regionMap[regionName.toLowerCase()] = regionId;
            }

            let productId = productMap[productName.toLowerCase()];
            if (!productId) {
                const resProduct = await dbRun("INSERT INTO products (name, unit) VALUES (?, ?)", [productName, unitName]);
                productId = resProduct.lastID;
                productMap[productName.toLowerCase()] = productId;
            }

            let sourceId = sourceMap[sourceName.toLowerCase()];
            if (!sourceId) {
                const resSource = await dbRun("INSERT INTO sources (name) VALUES (?)", [sourceName]);
                sourceId = resSource.lastID;
                sourceMap[sourceName.toLowerCase()] = sourceId;
            }

            const changePct = await calculateChangePct(regionId, productId, dateStr, price);

            await dbRun(
                `INSERT INTO price_records (date, region_id, product_id, unit, price_som, change_pct, source_id, notes, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    dateStr,
                    regionId,
                    productId,
                    unitName,
                    price,
                    changePct,
                    sourceId,
                    (data.Notes || data['Заметки'] || "").trim(),
                    req.user.id,
                    req.user.id,
                ]
            );
            insertedCount++;
        }

        if (errors.length > 0 && insertedCount === 0) {
            await dbRun("ROLLBACK");
            return res.status(400).json({ error: "All rows failed validation", details: errors });
        }

        await dbRun("COMMIT");
        res.json({ message: `Successfully imported ${insertedCount} records`, errors: errors.length > 0 ? errors : null });
    } catch (err) {
        await dbRun("ROLLBACK");
        res.status(500).json({ error: "Database error during bulk import", details: err.message });
    }
});

// ---- API: Analytics ----

// Price trends over time for a specific product (or all products)
app.get("/api/analytics/price-trends", async (req, res) => {
    try {
        const { product_id, region_id, date_from, date_to, group_by = "date" } = req.query;

        const conditions = ["pr.is_deleted = 0"];
        const params = [];

        if (product_id) {
            conditions.push("pr.product_id = ?");
            params.push(product_id);
        }
        if (region_id) {
            conditions.push("pr.region_id = ?");
            params.push(region_id);
        }
        if (date_from) {
            conditions.push("pr.date >= ?");
            params.push(date_from);
        }
        if (date_to) {
            conditions.push("pr.date <= ?");
            params.push(date_to);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        // Time series: average price per date per product
        const trendSql = `
            SELECT pr.date, p.name as product_name, p.id as product_id,
                   ROUND(AVG(pr.price_som), 2) as avg_price,
                   COUNT(*) as data_points
            FROM price_records pr
            LEFT JOIN products p ON pr.product_id = p.id
            LEFT JOIN regions r ON pr.region_id = r.id
            ${whereClause}
            GROUP BY pr.date, pr.product_id
            ORDER BY pr.date ASC
        `;
        const trends = await dbAll(trendSql, params);

        // Regional comparison: average price per region for selected product
        const regionSql = `
            SELECT r.name as region_name, r.id as region_id,
                   ROUND(AVG(pr.price_som), 2) as avg_price,
                   COUNT(*) as data_points
            FROM price_records pr
            LEFT JOIN regions r ON pr.region_id = r.id
            LEFT JOIN products p ON pr.product_id = p.id
            ${whereClause}
            GROUP BY pr.region_id
            ORDER BY avg_price DESC
        `;
        const regional = await dbAll(regionSql, params);

        // Summary stats
        const statsSql = `
            SELECT 
                COUNT(*) as total_records,
                COUNT(DISTINCT pr.product_id) as total_products,
                COUNT(DISTINCT pr.region_id) as total_regions,
                ROUND(AVG(pr.price_som), 2) as overall_avg_price,
                MIN(pr.date) as earliest_date,
                MAX(pr.date) as latest_date
            FROM price_records pr
            LEFT JOIN regions r ON pr.region_id = r.id
            LEFT JOIN products p ON pr.product_id = p.id
            ${whereClause}
        `;
        const stats = await dbGet(statsSql, params);

        res.json({ trends, regional, stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- API: Coverage Analytics (unique monitoring points per region) ----
app.get("/api/analytics/coverage", async (req, res) => {
    try {
        // Step 1: Get unique Region + Source pairs (monitoring points)
        // A "source" can be either source_text (free text) or the linked sources.name
        const pointsSql = `
            SELECT
                r.id   AS region_id,
                r.name AS region_name,
                COALESCE(NULLIF(TRIM(pr.source_text), ''), s.name, 'Неизвестный') AS source_name
            FROM price_records pr
            JOIN regions r ON pr.region_id = r.id
            LEFT JOIN sources s ON pr.source_id = s.id
            WHERE pr.is_deleted = 0
              AND r.is_active = 1
            GROUP BY pr.region_id, source_name
            ORDER BY r.name, source_name
        `;
        const points = await dbAll(pointsSql);

        // Step 2: Aggregate per region
        const regionMap = {};
        for (const row of points) {
            if (!regionMap[row.region_id]) {
                regionMap[row.region_id] = {
                    region_id: row.region_id,
                    region_name: row.region_name,
                    point_count: 0,
                    sources: [],
                };
            }
            regionMap[row.region_id].point_count++;
            regionMap[row.region_id].sources.push(row.source_name);
        }

        const regions = Object.values(regionMap);
        const totalPoints = regions.reduce((sum, r) => sum + r.point_count, 0);

        // Step 3: Add percentage
        const result = regions.map(r => ({
            ...r,
            percentage: totalPoints > 0
                ? Math.round((r.point_count / totalPoints) * 1000) / 10
                : 0,
        }));

        // Sort by point_count descending
        result.sort((a, b) => b.point_count - a.point_count);

        res.json({
            regions: result,
            total_points: totalPoints,
            total_regions: regions.length,
        });
    } catch (err) {
        console.error("Coverage analytics error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---- API: Public Stats for Homepage ----
app.get("/api/public/stats", async (req, res) => {
    try {
        // 1. Latest Update Date
        const latestDateRow = await dbGet(`SELECT MAX(date) as max_date FROM price_records WHERE is_deleted = 0`);
        const latestDate = latestDateRow && latestDateRow.max_date ? latestDateRow.max_date : '--';

        // 2. Products List
        const products = await dbAll(`SELECT name FROM products WHERE is_active = 1 ORDER BY name ASC`);
        const product_count = products.length;

        // 3. Unique Monitoring Points
        const pointsSql = `
            SELECT
                r.id   AS region_id,
                r.name AS region_name,
                COALESCE(NULLIF(TRIM(pr.source_text), ''), s.name, 'Неизвестный') AS source_name
            FROM price_records pr
            JOIN regions r ON pr.region_id = r.id
            LEFT JOIN sources s ON pr.source_id = s.id
            WHERE pr.is_deleted = 0
              AND r.is_active = 1
            GROUP BY pr.region_id, source_name
            ORDER BY r.name, source_name
        `;
        const points = await dbAll(pointsSql);
        const point_count = points.length;

        res.json({
            latest_date: latestDate,
            products: products.map(p => p.name),
            product_count: product_count,
            points: points,
            point_count: point_count
        });
    } catch (err) {
        console.error("Public stats error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ---- API: Users (RBAC) ----
app.get("/api/users", authenticate, checkAccess('users', 'Read'), async (req, res) => {
    try {
        const users = await dbAll('SELECT id, name, username, role, is_active, created_at, last_login_at, permissions FROM users WHERE is_active = 1');
        users.forEach(u => {
            try { u.permissions = JSON.parse(u.permissions); } catch(e) { u.permissions = {}; }
        });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/users", authenticate, checkAccess('users', 'Create'), async (req, res) => {
    try {
        const { name, username, password, role, permissions } = req.body;
        if (!username || !password || !role) return res.status(400).json({ error: "Логин, пароль и роль обязательны" });
        const hash = await bcrypt.hash(password, 10);
        const perms = JSON.stringify(permissions || {});
        const { id } = await dbRun('INSERT INTO users (name, username, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?)', [name||'', username, hash, role, perms]);
        res.json({ message: "Пользователь создан", id });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed: users.username')) return res.status(400).json({ error: "Такой логин уже существует" });
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/users/:id", authenticate, checkAccess('users', 'Update'), async (req, res) => {
    try {
        let { name, username, password, role, permissions } = req.body;
        const perms = JSON.stringify(permissions || {});
        let query = 'UPDATE users SET name = ?, username = ?, role = ?, permissions = ? WHERE id = ?';
        let params = [name||'', username, role, perms, req.params.id];
        
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            query = 'UPDATE users SET name = ?, username = ?, role = ?, permissions = ?, password_hash = ? WHERE id = ?';
            params = [name||'', username, role, perms, hash, req.params.id];
        }
        await dbRun(query, params);
        res.json({ message: "Пользователь обновлен" });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed: users.username')) return res.status(400).json({ error: "Такой логин уже существует" });
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/users/:id", authenticate, checkAccess('users', 'Delete'), async (req, res) => {
    try {
        if (req.params.id == req.user.id) return res.status(400).json({ error: "Нельзя удалить самого себя" });
        await dbRun('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
        res.json({ message: "Пользователь удален" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- API: Audit Logs ----
app.get("/api/audit-logs", authenticate, checkAccess('audit_logs', 'Read'), async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
        
        const countResult = await dbGet('SELECT COUNT(*) as total FROM audit_logs');
        const logs = await dbAll(`
            SELECT al.*, u.username, u.name as user_name
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT ? OFFSET ?
        `, [parseInt(limit), offset]);
        
        logs.forEach(log => {
            try { log.diff_json = JSON.parse(log.diff_json); } catch(e) {}
        });
        
        res.json({
            data: logs,
            meta: {
                total: countResult.total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(countResult.total / parseInt(limit))
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Static Serving ----

const adminPath = path.join(__dirname, "..", "admin");
const publicPath = path.join(__dirname, "..", "public-site");

// Admin static serving with authentication logic must come FIRST
// Protect HTML files specifically (so JS/CSS can still load login page)
app.use(
    "/admin",
    async (req, res, next) => {
        // If it's a CSS, JS, or images asset, let it through
        if (req.path.includes("/css/") || req.path.includes("/js/") || req.path.includes("/assets/")) {
            return next();
        }

        // If it's the login page, let it through
        if (req.path === "/login.html" || req.path === "/login") {
            return next();
        }

        // For anything else (dashboard.html, prices.html, /), check token
        const token = req.cookies.admin_token;
        if (!token) {
            return res.redirect("/admin/login.html");
        }

        try {
            jwt.verify(token, JWT_SECRET);
            next();
        } catch (ex) {
            return res.redirect("/admin/login.html");
        }
    },
    express.static(adminPath)
);

// Public site static serving comes next
app.use(express.static(publicPath));
app.use("/public-site", express.static(publicPath));

// Fallback for root (ensures / opens index.html)
app.get("/", (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

// ---- API: Health ----
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
    console.log("PUBLIC PATH:", publicPath);
    console.log("ADMIN PATH:", adminPath);
    console.log("index.html exists:", fs.existsSync(path.join(publicPath, "index.html")));
    console.log(`Main site:      http://localhost:${PORT}/`);
    console.log(`Admin Panel:    http://localhost:${PORT}/admin/login.html`);
});