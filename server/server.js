// ==============================
// 📦 Imports & Setup
// ==============================
const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const { Server } = require('socket.io');
const { validateQSO } = require('./rules');
const clientStatuses = {}; // socket.id => { band, mode }

// ==============================
// ⚙️ App Config
// ==============================
// Setup Express + HTTP + Socket.IO
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;
const ADMIN_PASSWORD = '9100943'; // ✅ Change this to your actual password

// Middleware
// Serve static frontend files
app.use(cors());
app.use(express.json());
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
    socket.on('statusUpdate', ({ band, mode }) => {
        clientStatuses[socket.id] = { band, mode };
        io.emit('userStatusUpdate', clientStatuses);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        delete clientStatuses[socket.id];
        io.emit('userStatusUpdate', clientStatuses);
    });
});

// Log a new QSO
app.post('/log', (req, res) => {
    const currentTime = new Date();
    const timeStr = currentTime.toISOString();
    const { callsign, band, mode, rxReport, sentReport, comments, isNonContest } = req.body;


    validateQSO(callsign, band, mode, currentTime, db, (valid, points, message) => {
        if (!valid) {
            return res.json({ success: false, message });
        }

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

                return res.json({ success: true });
            }
        );
    });
});

// Get all QSOs


app.post('/admin/clearLog', express.json(), (req, res) => {
    const { password } = req.body;

    if (password !== ADMIN_PASSWORD) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

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
    const id = req.params.id;
    const { callsign, band, mode, sentReport, rxReport, isNonContest, comments } = req.body;

    db.get(`SELECT time FROM qsos WHERE id = ?`, [id], (err, row) => {
        if (err || !row) {
            console.error('Time fetch failed:', err?.message);
            return res.status(500).json({ success: false, message: 'Time fetch failed' });
        }

        const originalTime = row.time;
        const points = isNonContest ? 0 : calculatePoints(band, mode, new Date(originalTime));

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
            [callsign, band, mode, sentReport, rxReport, points, originalTime, isNonContest, comments, id],
            function (err) {
                if (err) {
                    console.error('Update error:', err.message);
                    return res.status(500).json({ success: false });
                }

                return res.json({ success: true });
            }
        );
    });
});



app.post('/admin/yearsLicensed', (req, res) => {
    const value = req.body.value;

    if (typeof value !== 'number' || value < 0 || value > 999) {
        return res.status(400).json({ success: false, message: 'Invalid number' });
    }

    db.run(
        `INSERT INTO settings (key, value) VALUES ('yearsLicensed', ?) 
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [value.toString()],
        (err) => {
            if (err) {
                console.error('Failed to update settings:', err.message);
                return res.status(500).json({ success: false });
            }
            res.json({ success: true });
        }
    );
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


function calculatePoints(band, mode, time) {
    let points = (band === '160m' || band === '23cm') ? 2 : 1;
    if (mode === 'CW' || mode === 'RTTY') points *= 2;
    const hour = time.getHours();
    if (hour >= 1 && hour < 6) points *= 3;
    return points;
}

// Start the server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
