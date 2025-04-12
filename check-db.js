const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/contest.db');

db.all('SELECT * FROM qsos', [], (err, rows) => {
  if (err) throw err;
  console.log('All QSOs:', rows);
});
