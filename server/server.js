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
const { dbGet, dbAll, dbRun } = require("./db/database");

// --- Auth Middleware ---
const authenticate = async (req, res, next) => {
    const token = req.cookies.admin_token;
    if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await dbGet(`SELECT id, name, email, role FROM users WHERE id = ? AND is_active = 1`, [
            decoded.id,
        ]);
        if (!user) {
            return res.status(401).json({ error: "Invalid user" });
        }
        req.user = user;
        next();
    } catch (ex) {
        return res.status(401).json({ error: "Invalid token" });
    }
};

// --- Auth API ---
app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email и пароль обязательны" });
    }

    try {
        const user = await dbGet(`SELECT * FROM users WHERE email = ? AND is_active = 1`, [email]);
        if (!user) {
            return res.status(401).json({ error: "Неверный email или пароль" });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: "Неверный email или пароль" });
        }

        // Create token
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
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

        res.json({ message: "Успешный вход", user: { name: user.name, email: user.email, role: user.role } });
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
app.get("/api/regions", async (req, res) => {
    try {
        const rows = await dbAll(`SELECT id, name FROM regions WHERE is_active = 1 ORDER BY name`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/products", async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT id, name, category, unit FROM products WHERE is_active = 1 ORDER BY category, name`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
            conditions.push(`(r.name LIKE ? OR p.name LIKE ? OR s.name LIKE ?)`);
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
app.post("/api/price-records", authenticate, async (req, res) => {
    try {
        const { date, region_id, product_id, source_id, price_som, notes } = req.body;
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
            `INSERT INTO price_records (date, region_id, product_id, unit, price_som, change_pct, source_id, notes, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [date, region_id, product_id, unit, price_som, change_pct, source_id, notes, req.user.id, req.user.id]
        );

        res.status(201).json({ message: "Record created successfully", id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT - Update
app.put("/api/price-records/:id", authenticate, async (req, res) => {
    try {
        const id = req.params.id;
        const { date, region_id, product_id, source_id, price_som, change_pct, notes } = req.body;

        if (!date || !region_id || !product_id || price_som === undefined || price_som < 0) {
            return res.status(400).json({ error: "Missing or invalid required fields" });
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
        price_som = ?, change_pct = ?, source_id = ?, notes = ?, 
        updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
            [date, region_id, product_id, unit, price_som, finalChangePct, source_id, notes, req.user.id, id]
        );

        res.json({ message: "Record updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE - Soft Delete
app.delete("/api/price-records/:id", authenticate, async (req, res) => {
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

app.post("/api/price-records-import-csv", authenticate, upload.single("csvFile"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const results = [];
    const errors = [];
    let rowNumber = 1;

    try {
        const regions = await dbAll("SELECT id, name FROM regions");
        const products = await dbAll("SELECT id, name FROM products");
        const sources = await dbAll("SELECT id, name FROM sources");

        const regionMap = regions.reduce((acc, r) => ({ ...acc, [r.name.toLowerCase()]: r.id }), {});
        const productMap = products.reduce((acc, p) => ({ ...acc, [p.name.toLowerCase()]: p.id }), {});
        const sourceMap = sources.reduce((acc, s) => ({ ...acc, [s.name.toLowerCase()]: s.id }), {});

        fs.createReadStream(req.file.path)
            .pipe(csvParser())
            .on("data", (data) => {
                rowNumber++;
                const regionName = (data.Region || "").trim();
                const productName = (data.Product || "").trim();
                const sourceName = (data.Source || "").trim();

                const regionId = regionName ? regionMap[regionName.toLowerCase()] : null;
                const productId = productName ? productMap[productName.toLowerCase()] : null;
                const sourceId = sourceName ? sourceMap[sourceName.toLowerCase()] : null;

                const date = (data.Date || "").trim();
                const price = parseFloat((data.Price || "").replace(",", "."));

                if (!date || !regionId || !productId || isNaN(price) || price < 0) {
                    errors.push(
                        `Row ${rowNumber}: Invalid Data (Required: Date, Valid Region, Valid Product, Valid Price)`
                    );
                } else {
                    results.push({
                        date,
                        region_id: regionId,
                        product_id: productId,
                        source_id: sourceId,
                        price_som: price,
                        notes: (data.Notes || "").trim(),
                    });
                }
            })
            .on("end", async () => {
                // Cleanup file
                fs.unlinkSync(req.file.path);

                if (errors.length > 0) {
                    return res.status(400).json({ error: "Validation failed for some rows", details: errors });
                }

                let insertedCount = 0;
                try {
                    await dbRun("BEGIN TRANSACTION");

                    for (const row of results) {
                        const prod = await dbGet(`SELECT unit FROM products WHERE id = ?`, [row.product_id]);
                        const unit = prod ? prod.unit : null;
                        const changePct = await calculateChangePct(row.region_id, row.product_id, row.date, row.price_som);

                        await dbRun(
                            `INSERT INTO price_records (date, region_id, product_id, unit, price_som, change_pct, source_id, notes, created_by, updated_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                row.date,
                                row.region_id,
                                row.product_id,
                                unit,
                                row.price_som,
                                changePct,
                                row.source_id,
                                row.notes,
                                req.user.id,
                                req.user.id,
                            ]
                        );
                        insertedCount++;
                    }

                    await dbRun("COMMIT");
                    res.json({ message: `Successfully imported ${insertedCount} records` });
                } catch (dbErr) {
                    await dbRun("ROLLBACK");
                    res.status(500).json({ error: "Database error during import", details: dbErr.message });
                }
            })
            .on("error", () => {
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                res.status(500).json({ error: "Error processing CSV" });
            });
    } catch (err) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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