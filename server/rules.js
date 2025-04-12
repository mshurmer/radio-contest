function validateQSO(callsign, band, mode, time, db, callback) {
    let points = 1;

    if (band === '160m' || band === '23cm') {
        points = 2;
    }

    if (mode === 'CW' || mode === 'RTTY') {
        points *= 2;
    }

    const localHour = time.getHours();
    if (localHour >= 1 && localHour < 6) {
        points *= 3;
    }

    const threeHoursAgo = new Date(time.getTime() - 3 * 60 * 60 * 1000).toISOString();

    db.get(
        `SELECT * FROM qsos 
     WHERE callsign = ? AND band = ? AND mode = ? AND time > ? 
     ORDER BY time DESC LIMIT 1`,
        [callsign, band, mode, threeHoursAgo],
        (err, row) => {
            if (err) {
                console.error('DB error during validation:', err.message);
                return callback(false, 0, 'Validation DB error');
            }

            if (row) {
                return callback(false, 0, 'Contact already made within 3 hours on same band/mode.');
            }

            // No recent contact — valid QSO
            return callback(true, points, '');
        }
    );
}

module.exports = { validateQSO };

