const sqlite3 = require('sqlite3').verbose();

// Create database connection
const db = new sqlite3.Database('./bothub.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initializeTables();
    }
});

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
    `, (err) => {
        if (err) {
            console.error('Error creating users table:', err.message);
        }
    });

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
    `, (err) => {
        if (err) {
            console.error('Error creating downloads table:', err.message);
        } else {
            // Check if download_type column exists, if not add it
            db.all("PRAGMA table_info(downloads)", (err, columns) => {
                if (!err && columns) {
                    const hasDownloadType = columns.some(col => col.name === 'download_type');
                    if (!hasDownloadType) {
                        db.run("ALTER TABLE downloads ADD COLUMN download_type TEXT DEFAULT 'rdx'", (err) => {
                            if (err) console.log('Column may already exist:', err.message);
                        });
                    }
                }
            });
        }
    });

    // Create index for faster counting
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_downloads_date ON downloads(download_date)
    `, (err) => {
        if (err) {
            console.error('Error creating index:', err.message);
        }
    });

    // GitHub clones table
    db.run(`
        CREATE TABLE IF NOT EXISTS github_clones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clone_date DATE DEFAULT CURRENT_DATE,
            clone_time DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating github_clones table:', err.message);
        }
    });

    console.log('Database tables initialized.');
}

// User functions
function createUser(username, email, password, callback) {
    const sql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
    db.run(sql, [username, email, password], function (err) {
        if (err) {
            callback(err, null);
        } else {
            callback(null, { id: this.lastID, username, email });
        }
    });
}

function findUserByEmail(email, callback) {
    const sql = 'SELECT * FROM users WHERE email = ?';
    db.get(sql, [email], (err, row) => {
        callback(err, row);
    });
}

function findUserByUsername(username, callback) {
    const sql = 'SELECT * FROM users WHERE username = ?';
    db.get(sql, [username], (err, row) => {
        callback(err, row);
    });
}

function findUserByEmailOrUsername(loginInput, callback) {
    // Check if input is email or username
    const isEmail = loginInput.includes('@');
    let sql, params;

    if (isEmail) {
        sql = 'SELECT * FROM users WHERE email = ?';
        params = [loginInput];
    } else {
        sql = 'SELECT * FROM users WHERE username = ?';
        params = [loginInput];
    }

    db.get(sql, params, (err, row) => {
        callback(err, row);
    });
}

// Download functions
function recordDownload(userId, downloadType, callback) {
    const sql = 'INSERT INTO downloads (user_id, download_type) VALUES (?, ?)';
    db.run(sql, [userId, downloadType || 'rdx'], function (err) {
        callback(err);
    });
}

function getTotalDownloads(callback) {
    const sql = 'SELECT COUNT(*) as count FROM downloads';
    db.get(sql, (err, row) => {
        callback(err, row ? row.count : 0);
    });
}

function getDownloadsByType(callback) {
    const sql = "SELECT download_type, COUNT(*) as count FROM downloads GROUP BY download_type";
    db.all(sql, (err, rows) => {
        if (err) {
            callback(err, { rdx: 0, c3c: 0 });
        } else {
            const result = { rdx: 0, c3c: 0 };
            rows.forEach(row => {
                if (row.download_type === 'rdx') result.rdx = row.count;
                if (row.download_type === 'c3c') result.c3c = row.count;
            });
            callback(err, result);
        }
    });
}

function getTodayDownloads(callback) {
    const sql = "SELECT COUNT(*) as count FROM downloads WHERE download_date = date('now')";
    db.get(sql, (err, row) => {
        callback(err, row ? row.count : 0);
    });
}

function getUserCount(callback) {
    const sql = 'SELECT COUNT(*) as count FROM users';
    db.get(sql, (err, row) => {
        callback(err, row ? row.count : 0);
    });
}

// GitHub clone functions
function recordGithubClone(callback) {
    const sql = 'INSERT INTO github_clones (clone_date) VALUES (date("now"))';
    db.run(sql, function (err) {
        callback(err);
    });
}

function getGithubCloneCount(callback) {
    const sql = 'SELECT COUNT(*) as count FROM github_clones';
    db.get(sql, (err, row) => {
        callback(err, row ? row.count : 0);
    });
}

// Verification functions
function setVerificationCode(email, code, expires, callback) {
    const sql = 'UPDATE users SET verification_code = ?, verification_expires = ? WHERE email = ?';
    db.run(sql, [code, expires, email], function (err) {
        callback(err);
    });
}

function verifyCode(email, code, callback) {
    const sql = 'SELECT * FROM users WHERE email = ? AND verification_code = ? AND verification_expires > datetime("now")';
    db.get(sql, [email, code], (err, row) => {
        if (err || !row) {
            callback(err, false);
        } else {
            // Mark as verified
            db.run('UPDATE users SET is_verified = 1, verification_code = NULL, verification_expires = NULL WHERE email = ?', [email], (err2) => {
                callback(err2, true);
            });
        }
    });
}

function isUserVerified(email, callback) {
    const sql = 'SELECT is_verified FROM users WHERE email = ?';
    db.get(sql, [email], (err, row) => {
        callback(err, row ? row.is_verified === 1 : false);
    });
}

function getUserById(userId, callback) {
    const sql = 'SELECT * FROM users WHERE id = ?';
    db.get(sql, [userId], (err, row) => {
        callback(err, row);
    });
}

module.exports = {
    db,
    createUser,
    findUserByEmail,
    findUserByUsername,
    findUserByEmailOrUsername,
    recordDownload,
    getTotalDownloads,
    getTodayDownloads,
    getUserCount,
    getDownloadsByType,
    recordGithubClone,
    getGithubCloneCount,
    setVerificationCode,
    verifyCode,
    isUserVerified,
    getUserById
};
