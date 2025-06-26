function calculatePoints(band, mode, time) {
    let points = (band === '160m' || band === '23cm') ? 2 : 1;
    if (mode === 'CW' || mode === 'RTTY') points *= 2;
    const hour = time.getHours();
    if (hour >= 1 && hour < 6) points *= 3;
    return points;
}

function validateQSO(callsign, band, mode, time, excludeId, db, callback) {
    const threeHoursAgo = new Date(time.getTime() - 3 * 60 * 60 * 1000).toISOString();
    const query = `SELECT * FROM qsos WHERE band = ? AND mode = ? AND time > ?`;
    const params = [band, mode, threeHoursAgo];

    console.log('🧩 excludeId passed in:', excludeId, 'as type:', typeof excludeId);
    console.log('💬 SQL:', query, params);

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('❌ Validation DB error:', err.message);
            return callback({ valid: false, points: 0, message: 'DB error during validation' });
        }

        console.log('🔍 Validation returned rows:', rows);

        for (const row of rows) {
            const isSameCallsign = row.callsign.toLowerCase() === callsign.toLowerCase();
            const isSameId = excludeId != null && row.id == excludeId; // Allow == to coerce number/string
            console.log(`🧐 Checking row ID ${row.id}: isSameCallsign=${isSameCallsign}, isSameId=${isSameId}`);

            if (isSameCallsign && !isSameId) {
                console.warn('⚠️ Conflict found:', row);
                return callback({
                    valid: false,
                    points: 0,
                    message: 'Contact already made within 3 hours on same band/mode with this callsign'
                });
            }
        }

        console.log('✅ No conflict detected — allowed');
        const points = calculatePoints(band, mode, time);
        return callback({ valid: true, points, message: '' });
    });
}





module.exports = { validateQSO, calculatePoints };
