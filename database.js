const initSqlJs = require('sql.js');

let db = null;

// Initialize database
async function initDatabase() {
    const SQL = await initSqlJs();

    // Try to load existing database
    try {
        const fs = require('fs');
        if (fs.existsSync('./bothub.db')) {
            const fileBuffer = fs.readFileSync('./bothub.db');
            db = new SQL.Database(fileBuffer);
            console.log('Loaded existing database.');
        } else {
            db = new SQL.Database();
            console.log('Created new database.');
        }
    } catch (err) {
        console.log('Error loading database, creating new one:', err.message);
        db = new SQL.Database();
    }

    initializeTables();
    return db;
}

// Initialize database tables
function initializeTables() {
    // Users table with verification fields
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            is_verified INTEGER DEFAULT 0,
            verification_code TEXT,
            verification_expires DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Downloads table for tracking
    db.run(`
        CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            download_type TEXT DEFAULT 'rdx',
            download_date DATE DEFAULT CURRENT_DATE,
            download_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Create index for faster counting
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_downloads_date ON downloads(download_date)
    `);

    // GitHub clones table
    db.run(`
        CREATE TABLE IF NOT EXISTS github_clones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clone_date DATE DEFAULT CURRENT_DATE,
            clone_time DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Save database to file
    saveDatabase();
    console.log('Database tables initialized.');
}

// Save database to file
function saveDatabase() {
    try {
        const fs = require('fs');
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync('./bothub.db', buffer);
    } catch (err) {
        console.error('Error saving database:', err.message);
    }
}

// User functions
function createUser(username, email, password, callback) {
    try {
        const sql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
        db.run(sql, [username, email, password]);
        const result = db.exec('SELECT last_insert_rowid() as id');
        const id = result[0]?.values[0]?.[0] || 0;
        saveDatabase();
        callback(null, { id, username, email });
    } catch (err) {
        callback(err, null);
    }
}

function findUserByEmail(email, callback) {
    try {
        const sql = 'SELECT * FROM users WHERE email = ?';
        const stmt = db.prepare(sql);
        stmt.bind([email]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            callback(null, row);
        } else {
            stmt.free();
            callback(null, null);
        }
    } catch (err) {
        callback(err, null);
    }
}

function findUserByUsername(username, callback) {
    try {
        const sql = 'SELECT * FROM users WHERE username = ?';
        const stmt = db.prepare(sql);
        stmt.bind([username]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            callback(null, row);
        } else {
            stmt.free();
            callback(null, null);
        }
    } catch (err) {
        callback(err, null);
    }
}

function findUserByEmailOrUsername(loginInput, callback) {
    const isEmail = loginInput.includes('@');
    let sql, params;

    if (isEmail) {
        sql = 'SELECT * FROM users WHERE email = ?';
        params = [loginInput];
    } else {
        sql = 'SELECT * FROM users WHERE username = ?';
        params = [loginInput];
    }

    try {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            callback(null, row);
        } else {
            stmt.free();
            callback(null, null);
        }
    } catch (err) {
        callback(err, null);
    }
}

// Download functions
function recordDownload(userId, downloadType, callback) {
    try {
        const sql = 'INSERT INTO downloads (user_id, download_type) VALUES (?, ?)';
        db.run(sql, [userId, downloadType || 'rdx']);
        saveDatabase();
        callback(null);
    } catch (err) {
        callback(err);
    }
}

function getTotalDownloads(callback) {
    try {
        const sql = 'SELECT COUNT(*) as count FROM downloads';
        const result = db.exec(sql);
        const count = result[0]?.values[0]?.[0] || 0;
        callback(null, count);
    } catch (err) {
        callback(err, 0);
    }
}

function getDownloadsByType(callback) {
    try {
        const sql = "SELECT download_type, COUNT(*) as count FROM downloads GROUP BY download_type";
        const result = db.exec(sql);
        const resultObj = { rdx: 0, c3c: 0 };
        if (result[0]) {
            result[0].values.forEach(row => {
                if (row[0] === 'rdx') resultObj.rdx = row[1];
                if (row[0] === 'c3c') resultObj.c3c = row[1];
            });
        }
        callback(null, resultObj);
    } catch (err) {
        callback(err, { rdx: 0, c3c: 0 });
    }
}

function getTodayDownloads(callback) {
    try {
        const sql = "SELECT COUNT(*) as count FROM downloads WHERE download_date = date('now')";
        const result = db.exec(sql);
        const count = result[0]?.values[0]?.[0] || 0;
        callback(null, count);
    } catch (err) {
        callback(err, 0);
    }
}

function getUserCount(callback) {
    try {
        const sql = 'SELECT COUNT(*) as count FROM users';
        const result = db.exec(sql);
        const count = result[0]?.values[0]?.[0] || 0;
        callback(null, count);
    } catch (err) {
        callback(err, 0);
    }
}

// GitHub clone functions
function recordGithubClone(callback) {
    try {
        const sql = 'INSERT INTO github_clones (clone_date) VALUES (date("now"))';
        db.run(sql);
        saveDatabase();
        callback(null);
    } catch (err) {
        callback(err);
    }
}

function getGithubCloneCount(callback) {
    try {
        const sql = 'SELECT COUNT(*) as count FROM github_clones';
        const result = db.exec(sql);
        const count = result[0]?.values[0]?.[0] || 0;
        callback(null, count);
    } catch (err) {
        callback(err, 0);
    }
}

// Verification functions
function setVerificationCode(email, code, expires, callback) {
    try {
        const sql = 'UPDATE users SET verification_code = ?, verification_expires = ? WHERE email = ?';
        db.run(sql, [code, expires, email]);
        saveDatabase();
        callback(null);
    } catch (err) {
        callback(err);
    }
}

function verifyCode(email, code, callback) {
    try {
        const sql = 'SELECT * FROM users WHERE email = ? AND verification_code = ? AND verification_expires > datetime("now")';
        const stmt = db.prepare(sql);
        stmt.bind([email, code]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            callback(null, row);
        } else {
            stmt.free();
            callback(null, null);
        }
    } catch (err) {
        callback(err, null);
    }
}

function markUserVerified(email, callback) {
    try {
        const sql = 'UPDATE users SET is_verified = 1, verification_code = NULL, verification_expires = NULL WHERE email = ?';
        db.run(sql, [email]);
        saveDatabase();
        callback(null);
    } catch (err) {
        callback(err);
    }
}

function updatePassword(email, newPassword, callback) {
    try {
        const sql = 'UPDATE users SET password = ? WHERE email = ?';
        db.run(sql, [newPassword, email]);
        saveDatabase();
        callback(null);
    } catch (err) {
        callback(err);
    }
}

// Export functions
module.exports = {
    initDatabase,
    createUser,
    findUserByEmail,
    findUserByUsername,
    findUserByEmailOrUsername,
    recordDownload,
    getTotalDownloads,
    getDownloadsByType,
    getTodayDownloads,
    getUserCount,
    recordGithubClone,
    getGithubCloneCount,
    setVerificationCode,
    verifyCode,
    markUserVerified,
    updatePassword,
    getDb: () => db
};
