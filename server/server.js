// ==============================
// 📦 Imports & Setup
// ==============================
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const { Server } = require('socket.io');
const { validateQSO, calculatePoints } = require('./rules');
const clientStatuses = {}; // socket.id => { band, mode }
const APP_VERSION = 'v1.0 26July'; // 💡 Update this as needed





// this is about page security
const auth = require('basic-auth');

const USERS = {
    'log': 'secret123', // 🔐 change username and password as needed
};

function requireAuth(req, res, next) {
    const user = auth(req);
    if (!user || USERS[user.name] !== user.pass) {
        res.set('WWW-Authenticate', 'Basic realm="QSO Logger"');
        return res.status(401).send('Authentication required.');
    }
    next();
}

//setup a logging process

const actionLogPath = path.join(__dirname, '../logs/user_actions.log');
function logUserAction(user, action, data = {}) {
    const timestamp = new Date().toISOString();
    const logLine = `${timestamp} | ${user || 'UNKNOWN'} | ${action} | ${JSON.stringify(data)}\n`;

    fs.appendFile(actionLogPath, logLine, (err) => {
        if (err) console.error('⚠️ Failed to write user action log:', err.message);
    });
}

if (!fs.existsSync(path.join(__dirname, '../logs'))) {
    fs.mkdirSync(path.join(__dirname, '../logs'), { recursive: true });
}



// ==============================
// ⚙️ App Config
// ==============================
// Setup Express + HTTP + Socket.IO
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;
const ADMIN_PASSWORD = '9100943'; // ✅ Change this to your actual password

// verion app
app.get('/version', (req, res) => {
    res.json({ version: APP_VERSION });
});




// Middleware
// Serve static frontend files
app.use(cors());
app.use(express.json());

//protect the page
const USE_AUTH = process.env.REQUIRE_LOGIN === 'true';
console.log('🔐 REQUIRE_LOGIN is:', process.env.REQUIRE_LOGIN);
console.log('🔐 USE_AUTH is:', USE_AUTH);

// ==============================
// 📤 SQLite Dump Endpoint
// ==============================

const { exec } = require('child_process');

// Optional: restrict access with a token
const DUMP_TOKEN = process.env.DUMP_TOKEN || 'supersecret'; // put this in your `.env` if you want

app.get('/dump', (req, res) => {
    // Optionally require token like: /dump?token=supersecret
    if (req.query.token !== DUMP_TOKEN) {
        return res.status(403).send('❌ Forbidden: Missing or wrong token');
    }

    console.log('📤 Received /dump request');

    exec(`sqlite3 ${dbPath} .dump`, (err, stdout, stderr) => {
        if (err) {
            console.error('❌ Dump failed:', stderr);
            return res.status(500).send('Failed to generate dump');
        }

        res.setHeader('Content-Type', 'text/plain');
        res.send(stdout);
    });
});




if (USE_AUTH) {
    
    app.use(requireAuth); // ✅ Protects all frontend pages
    
}

app.use(express.static(path.join(__dirname, '../public')));

// ==============================
// 🗃️ SQLite Database
// ==============================
// SQLite setup creat the table
const db = new sqlite3.Database(path.join(__dirname, '../db/contest.db'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS qsos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    callsign TEXT,
    band TEXT,
    mode TEXT,
    time TEXT,
    points INTEGER,
    sentReport TEXT,
    rxReport TEXT,
    comments TEXT,
  isNonContest INTEGER DEFAULT 0
  )`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
)`);

    db.run(`CREATE TABLE IF NOT EXISTS cabrillo_headers (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);


    // Initialize default if not set
    db.get(`SELECT value FROM settings WHERE key = 'yearsLicensed'`, [], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO settings (key, value) VALUES ('yearsLicensed', '0')`);
        }
    });
});





// Socket.IO connection
io.on('connection', (socket) => {
    console.log('🔌 A client connected via WebSocket');
    console.log('Client connected:', socket.id);

    // Listen for status updates from a client
    socket.on('statusUpdate', ({ band, mode, name }) => {
        clientStatuses[socket.id] = { band, mode, name };
        io.emit('userStatusUpdate', clientStatuses);

        // First, group users by band+mode
        const bandModeMap = {};

        for (const [id, s] of Object.entries(clientStatuses)) {
            const key = `${s.band}|${s.mode}`;
            if (!bandModeMap[key]) bandModeMap[key] = [];
            bandModeMap[key].push(id);
        }

        // Now go through all users and update their warning status
        for (const [key, ids] of Object.entries(bandModeMap)) {
            const warning = ids.length > 1
                ? `⚠️ Someone else is also using ${key.replace('|', ' ')}`
                : '';

            ids.forEach(id => {
                io.to(id).emit('bandWarning', warning);
            });
        }



    });

    socket.on('setBand', (band) => {
        // Save the band for this user
        clientStatuses[socket.id] = {
            ...(clientStatuses[socket.id] || {}),
            band
        };

        // Check if anyone else is using the same band
        const sameBandUser = Object.entries(clientStatuses).find(([id, status]) =>
            id !== socket.id && status.band === band
        );

        if (sameBandUser) {
            socket.emit('bandWarning', `⚠️ Another user is currently on ${band}`);
        } else {
            socket.emit('bandWarning', ''); // No warning
        }

        // Optional: keep updating all users with current statuses
        io.emit('userStatusUpdate', clientStatuses);
    });




    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        delete clientStatuses[socket.id];
        io.emit('userStatusUpdate', clientStatuses);
    });
});

function requirePassword(req, res, next) {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    next();
}


// Log a new QSO
app.post('/log', (req, res) => {
    const currentTime = new Date();
    const timeStr = currentTime.toISOString();
    const { callsign, band, mode, rxReport, sentReport, comments, isNonContest, operatorName } = req.body;

    console.log('📩 Server received QSO from operator:', req.body.operatorName || 'anonymous');
    logUserAction(req.body.operatorName || 'anonymous', 'Log QSO', {
        callsign, band, mode, rxReport, sentReport, isNonContest
    });


    validateQSO(callsign, band, mode, currentTime,null, db, ({ valid, points, message }) => {
        console.log('🔍 validateQSO result:', { valid, points, message });

        if (!valid) {
            return res.json({ success: false, message });
        }

        const actualPoints = parseInt(isNonContest) === 1 ? 0 : points;

        console.log('Inserting QSO with points:', actualPoints, 'isNonContest:', isNonContest);


        db.run(
            `INSERT INTO qsos (callsign, band, mode, time, points, sentReport, rxReport, comments,isNonContest)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [callsign, band, mode, timeStr, points, sentReport, rxReport, comments, isNonContest],
            function (err) {
                if (err) {
                    console.error('Insert error:', err.message);
                    return res.json({ success: false, message: 'DB Error: ' + err.message });
                }

                io.emit('newQSO', {
                    id: this.lastID,
                    callsign,
                    band,
                    mode,
                    points,
                    time: timeStr,
                    sentReport,
                    rxReport,
                    comments,
                    isNonContest
                });

                console.log('📝 Logging QSO to DB...');
                console.log('📁 Attempting backup write...');

                appendToBackupFile({
                    callsign,
                    band,
                    mode,
                    sentReport,
                    rxReport,
                    comments,
                    isNonContest
                });

                console.log('✅ appendToBackupFile called');



                appendToBackupFile({
                    callsign,
                    band,
                    mode,
                    sentReport,
                    rxReport,
                    comments,
                    isNonContest
                });


                return res.json({ success: true });
            }
        );
    });
});
//export the calbro log 
app.get('/export/cabrillo', (req, res) => {
    const headersToLoad = [
        'LOCATION','CALLSIGN','CLUB','CONTEST','CATEGORY-OPERATOR', 'CATEGORY-BAND',
        'CATEGORY-MODE', 'CATEGORY-POWER', 'CATEGORY-STATION', 'CATEGORY-TRANSMITTER',
        'CLAIMED-SCORE', 'OPERATORS', 'EMAIL','NAME', 'ADDRESS', 'ADDRESS-CITY', 'ADDRESS-STATE-PROVINCE', 'ADDRESS-POSTALCODE',
          'CREATED-BY','SOAPBOX'
    ];

    // Step 1: Load header fields
    db.all(`SELECT key, value FROM cabrillo_headers WHERE key IN (${headersToLoad.map(() => '?').join(',')})`, headersToLoad, (err, rows) => {
        if (err) {
            console.error('Header fetch error:', err.message);
            return res.status(500).send('Failed to fetch headers');
        }

         //calculate claimed score here
       

        const headerMap = Object.fromEntries(rows.map(row => [row.key, row.value || '']));

        // Fill missing headers with default value
        headersToLoad.forEach(key => {
            if (!headerMap[key]) {
                headerMap[key] = 'UNKNOWN';
            }
        });

        // Step 2: Load QSO entries
        db.all('SELECT * FROM qsos WHERE isNonContest = 0 ORDER BY time ASC', [], (err, qsos) => {
            if (err) {
                console.error('QSO fetch error:', err.message);
                return res.status(500).send('Failed to fetch QSOs');
            }
            //calculate claimed score here
            const claimedScore = qsos.reduce((sum, qso) => sum + (qso.points || 0), 0);

            const lines = [];

            // Start of log
            lines.push('START-OF-LOG: 3.0');

            // Headers
            headersToLoad.forEach(key => {
                let val = (headerMap[key] || '').trim();
                if (key === 'CLAIMED-SCORE') val = claimedScore.toString(); // overwrite with calculated score
                lines.push(`${key}: ${val || 'UNKNOWN'}`);
            });

           // lines.push(''); // Empty line before QSOs

            // QSO lines
            const operatorCallsign = (headerMap['CALLSIGN'] || 'UNKNOWN').padEnd(8);

            for (const qso of qsos) {
                const qsoDate = new Date(qso.time);
                const yyyy = qsoDate.getUTCFullYear();
                const mm = String(qsoDate.getUTCMonth() + 1).padStart(2, '0');
                const dd = String(qsoDate.getUTCDate()).padStart(2, '0');
                const hh = String(qsoDate.getUTCHours()).padStart(2, '0');
                const min = String(qsoDate.getUTCMinutes()).padStart(2, '0');

                // Frequency in kHz
                const bandMap = {
                    '160m': '  1800',
                    '80m': '  3500',
                    '40m': '  7000',
                    '20m': ' 14000',
                    '15m': ' 21000',
                    '10m': ' 28000',
                    '23cm': '1296000'
                };
                const freq = bandMap[qso.band] || '0000';

                // Cabrillo mode
                const modeMap = {
                    'SSB': 'PH',
                    'CW': 'CW',
                    'RTTY': 'RY',
                    'FM': 'FM'
                };
                const cabrilloMode = modeMap[qso.mode] || qso.mode;

                const myCall = (headerMap['CALLSIGN'] || 'UNKNOWN').padEnd(13);
                const theirCall = qso.callsign.padEnd(13);

                const sentRpt = (qso.sentReport.substring(0, 2) || '59').padEnd(3);
                const sentNr = (qso.sentReport.substring(2) || '001').padEnd(6);
                const rcvdRpt = (qso.rxReport.substring(0, 2) || '59').padEnd(3);
                const rcvdNr = (qso.rxReport.substring(2) || '001').padEnd(6);

                const qsoLine =
                    `QSO:${freq} ${cabrilloMode} ${yyyy}-${mm}-${dd} ${hh}${min} ${myCall} ${sentRpt} ${sentNr} ${theirCall} ${rcvdRpt} ${rcvdNr}`;

                lines.push(qsoLine);
            }

            lines.push('END-OF-LOG:');

            const logText = lines.join('\r\n');

            res.setHeader('Content-Disposition', 'attachment; filename="contest_log.cabrillo"');
            res.setHeader('Content-Type', 'text/plain');
            res.send(logText);
        });
    });
});







// Get all QSOs
app.post('/admin/clearLog', express.json(), requirePassword, (req, res) => {
    const operator = req.body.operator || 'anonymous';

    logUserAction(operator, 'Clear All Logs');

    db.run('DELETE FROM qsos', function (err) {
        if (err) {
            console.error('Error clearing log:', err);
            return res.status(500).json({ success: false });
        }

        io.emit('newQSO', {}); // notify clients to refresh if needed
        res.json({ success: true });
    });
});




// delete
app.delete('/log/:id', (req, res) => {
    const id = req.params.id;
    const operator = req.query.operator || 'anonymous';

    // First: get the QSO details
    db.get('SELECT * FROM qsos WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('Fetch before delete failed:', err.message);
            return res.status(500).json({ success: false });
        }
        if (!row) {
            return res.status(404).json({ success: false, message: 'QSO not found' });
        }

        // Log the full QSO details before deleting
        logUserAction(operator, 'Delete QSO', row);

        // Proceed to delete
        db.run('DELETE FROM qsos WHERE id = ?', [id], function (err2) {
            if (err2) {
                console.error('Delete error:', err2.message);
                return res.status(500).json({ success: false });
            }
            res.json({ success: true });
        });
    });
});


app.put('/log/:id', (req, res) => {
    const id = parseInt(req.params.id);
    console.log('🛠 Editing QSO ID:', id);

    const { callsign, band, mode, sentReport, rxReport, isNonContest, comments } = req.body;

    db.get(`SELECT time FROM qsos WHERE id = ?`, [id], (err, row) => {
        if (err || !row) {
            console.error('Time fetch failed:', err?.message);
            return res.status(500).json({ success: false, message: 'Time fetch failed' });
        }

        const originalTime = row.time;
        const parsedTime = new Date(originalTime);
        console.log('⚙️ validateQSO called with excludeId:', id);

        validateQSO(callsign, band, mode, parsedTime, id, db, ({ valid, points, message }) => {
            console.log('🔍 validateQSO result:', { valid, points, message });
            // ✅ SKIP validation entirely when editing a QSO
            const finalPoints = parseInt(isNonContest) === 1 ? 0 : calculatePoints(band, mode, parsedTime);

            // ✅ Add logging before updating
            logUserAction(req.body.operatorName || 'anonymous', 'Edit QSO', {
                id,
                callsign,
                band,
                mode,
                sentReport,
                rxReport,
                isNonContest,
                comments
            });




            db.run(
                `UPDATE qsos SET 
        callsign = ?, 
        band = ?, 
        mode = ?, 
        sentReport = ?, 
        rxReport = ?, 
        points = ?, 
        isNonContest = ?,
        comments = ?
    WHERE id = ?`,
                [callsign, band, mode, sentReport, rxReport, finalPoints, isNonContest, comments, id],
                function (err) {
                    if (err) {
                        console.error('Update error:', err.message);
                        return res.status(500).json({ success: false });
                    }
                    // 👇 Add this line here:
                    logUserAction(req.body.operatorName || 'anonymous', 'Edit QSO', {
                        id,
                        callsign,
                        band,
                        mode,
                        sentReport,
                        rxReport,
                        isNonContest,
                        comments
                    });
                    res.json({ success: true });
                }
            );

           
        });


    });
});


const REQUIRED_HEADER_FIELDS = [
    'CALLSIGN',
    'CONTEST',
    'CATEGORY-OPERATOR',
    'CATEGORY-ASSISTED',
    'CATEGORY-BAND',
    'CATEGORY-MODE',
    'CATEGORY-POWER',
    'CATEGORY-STATION',
    'CATEGORY-TRANSMITTER',
    'CLAIMED-SCORE',
    'CLUB',
    'CREATED-BY',
    'EMAIL',
    'GRID-LOCATOR',
    'LOCATION',
    'NAME',
    'ADDRESS',
    'ADDRESS-CITY',
    'ADDRESS-STATE-PROVINCE',
    'ADDRESS-POSTALCODE',
    'ADDRESS-COUNTRY',
    'OPERATORS',
    'SOAPBOX'
];

REQUIRED_HEADER_FIELDS.forEach(field => {
    db.get(`SELECT value FROM cabrillo_headers WHERE key = ?`, [field], (err, row) => {
        if (err) {
            console.error(`Error checking cabrillo header for ${field}:`, err.message);
        } else if (!row) {
            db.run(`INSERT INTO cabrillo_headers (key, value) VALUES (?, '')`, [field], (err2) => {
                if (err2) {
                    console.error(`Failed to insert cabrillo header ${field}:`, err2.message);
                } else {
                    console.log(`📝 Inserted default Cabrillo header: ${field}`);
                }
            });
        }
    });
});




app.post('/admin/yearsLicensed', express.json(), requirePassword, (req, res) => {
    const value = req.body.value;
    const operator = req.body.operator || 'anonymous';

    if (typeof value !== 'number' || value < 0 || value > 999) {
        return res.status(400).json({ success: false, message: 'Invalid number' });
    }

    logUserAction(operator, 'Update Years Licensed', { value });

    db.get(`SELECT value FROM settings WHERE key = 'yearsLicensed'`, [], (err, row) => {
        if (err) {
            console.error('Failed to read settings:', err.message);
            return res.status(500).json({ success: false });
        }

        if (row) {
            db.run(`UPDATE settings SET value = ? WHERE key = 'yearsLicensed'`, [value.toString()], (err2) => {
                if (err2) {
                    console.error('Failed to update setting:', err2.message);
                    return res.status(500).json({ success: false });
                }
                res.json({ success: true });
            });
        } else {
            db.run(`INSERT INTO settings (key, value) VALUES ('yearsLicensed', ?)`, [value.toString()], (err2) => {
                if (err2) {
                    console.error('Failed to insert setting:', err2.message);
                    return res.status(500).json({ success: false });
                }
                res.json({ success: true });
            });
        }
    });
});


// Get all QSOs
app.get('/log', (req, res) => {
    db.all('SELECT * FROM qsos ORDER BY time DESC', (err, rows) => {
        if (err) {
            console.error('DB Fetch Error:', err.message);
            return res.status(500).json({ success: false });
        }
        res.json(rows); // ✅ Even if empty, this returns []
    });
});



app.get('/admin/yearsLicensed', (req, res) => {
    db.get(`SELECT value FROM settings WHERE key = 'yearsLicensed'`, [], (err, row) => {
        if (err || !row) {
            return res.status(500).json({ success: false });
        }

        const value = parseInt(row.value, 10);
        res.json({ success: true, value });
    });
});


// Get Cabrillo headers
app.get('/admin/cabrilloHeaders', (req, res) => {
    db.all(`SELECT key, value FROM cabrillo_headers`, [], (err, rows) => {
        if (err) {
            console.error('Failed to load Cabrillo headers:', err.message);
            return res.status(500).json({ success: false });
        }
        const headers = {};
        rows.forEach(row => { headers[row.key] = row.value; });
        res.json({ success: true, headers });
    });
});

// Save/update Cabrillo headers
app.post('/admin/cabrilloHeaders', express.json(), requirePassword, (req, res) => {
    const updates = req.body.headers;
    if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ success: false, message: 'Invalid data format' });
    }

    const queries = Object.entries(updates).map(([key, value]) => {
        return new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO cabrillo_headers (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `, [key, value], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });

    Promise.all(queries)
        .then(() => res.json({ success: true }))
        .catch(err => {
            console.error('Failed to save headers:', err.message);
            res.status(500).json({ success: false });
        });
});




function appendToBackupFile(qso) {
    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `qso_log_${dateStr}.txt`;
    const filePath = path.join(backupDir, filename);

    console.log('📁 Writing backup to:', filePath);


    const logLine = [
        new Date().toISOString(),
        qso.callsign,
        qso.band,
        qso.mode,
        qso.sentReport,
        qso.rxReport,
        `"${qso.comments || ''}"`,
        qso.isNonContest ? 1 : 0
    ].join(', ') + '\n';

    fs.appendFile(filePath, logLine, (err) => {
        if (err) {
            console.error('⚠️ Failed to write to backup file:', err.message);
        }
    });
}

const BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const dbPath = path.join(__dirname, '../db/contest.db');
const backupDir = path.join(__dirname, '../backups');

if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

function createBackup() {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const backupFilename = `contest_backup_${timestamp}.db`;
    const backupPath = path.join(backupDir, backupFilename);

    fs.copyFile(dbPath, backupPath, (err) => {
        if (err) {
            console.error('❌ Failed to create backup:', err.message);
        } else {
            console.log(`🗄️ Backup created: ${backupFilename}`);
        }
    });
}

// Run once immediately, then every 5 minutes
createBackup();
setInterval(createBackup, BACKUP_INTERVAL_MS);






// Start the server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
