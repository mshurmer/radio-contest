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
const APP_VERSION = 'v0.1'; // 💡 Update this as needed





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
    const { callsign, band, mode, rxReport, sentReport, comments, isNonContest } = req.body;


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

// Get all QSOs


app.post('/admin/clearLog', express.json(), requirePassword, (req, res) => {
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
    db.run(`DELETE FROM qsos WHERE id = ?`, [id], function (err) {
        if (err) {
            console.error('Delete error:', err.message);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true });
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

        validateQSO(callsign, band, mode, parsedTime,id, db, ({ valid, points, message }) => {
            console.log('🔍 validateQSO result:', { valid, points, message });

            if (!valid) {
                return res.status(400).json({ success: false, message });
            }

            const finalPoints = parseInt(isNonContest) === 1 ? 0 : points;

            db.run(
                `UPDATE qsos SET 
                    callsign = ?, 
                    band = ?, 
                    mode = ?, 
                    sentReport = ?, 
                    rxReport = ?, 
                    points = ?, 
                    time = ?, 
                    isNonContest = ?,
                    comments = ?
                WHERE id = ?`,
                [callsign, band, mode, sentReport, rxReport, finalPoints, originalTime, isNonContest, comments, id],
                function (err) {
                    if (err) {
                        console.error('Update error:', err.message);
                        return res.status(500).json({ success: false });
                    }

                    res.json({ success: true });
                }
            );
        }); 
    });
});






app.post('/admin/yearsLicensed', express.json(), requirePassword, (req, res) => {
    const value = req.body.value;

    if (typeof value !== 'number' || value < 0 || value > 999) {
        return res.status(400).json({ success: false, message: 'Invalid number' });
    }

    db.get(`SELECT value FROM settings WHERE key = 'yearsLicensed'`, [], (err, row) => {
        if (err) {
            console.error('Failed to read settings:', err.message);
            return res.status(500).json({ success: false });
        }

        if (row) {
            // Update existing value
            db.run(`UPDATE settings SET value = ? WHERE key = 'yearsLicensed'`, [value.toString()], (err2) => {
                if (err2) {
                    console.error('Failed to update setting:', err2.message);
                    return res.status(500).json({ success: false });
                }
                res.json({ success: true });
            });
        } else {
            // Insert new value
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



// Start the server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
