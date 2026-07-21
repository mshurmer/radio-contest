const test = require('node:test');
const assert = require('node:assert/strict');

const { calculatePoints, validateQSO } = require('../server/rules');

test('calculatePoints applies band, mode, and overnight multipliers', () => {
    assert.equal(calculatePoints('40m', 'SSB', new Date(2025, 0, 1, 12)), 1);
    assert.equal(calculatePoints('160m', 'CW', new Date(2025, 0, 1, 12)), 4);
    assert.equal(calculatePoints('40m', 'RTTY', new Date(2025, 0, 1, 2)), 6);
});

test('validateQSO rejects a duplicate callsign on the same band and mode', async () => {
    const time = new Date('2025-01-01T12:00:00.000Z');
    const db = {
        all(query, params, callback) {
            callback(null, [{ id: 7, callsign: 'VK6ABC' }]);
        }
    };

    const result = await new Promise(resolve => {
        validateQSO('vk6abc', '40m', 'SSB', time, null, db, resolve);
    });

    assert.equal(result.valid, false);
    assert.match(result.message, /already made/i);
});

test('validateQSO ignores the QSO currently being edited', async () => {
    const time = new Date('2025-01-01T12:00:00.000Z');
    const db = {
        all(query, params, callback) {
            callback(null, [{ id: 7, callsign: 'VK6ABC' }]);
        }
    };

    const result = await new Promise(resolve => {
        validateQSO('VK6ABC', '40m', 'SSB', time, 7, db, resolve);
    });

    assert.equal(result.valid, true);
});

test('validateQSO checks both sides of a historical three-hour window', async () => {
    const time = new Date('2025-01-01T12:00:00.000Z');
    let capturedQuery;
    let capturedParams;
    const db = {
        all(query, params, callback) {
            capturedQuery = query;
            capturedParams = params;
            callback(null, []);
        }
    };

    const result = await new Promise(resolve => {
        validateQSO('VK6NEW', '40m', 'SSB', time, null, db, resolve);
    });

    assert.equal(result.valid, true);
    assert.match(capturedQuery, /time > \? AND time < \?/);
    assert.equal(capturedParams[2], '2025-01-01T09:00:00.000Z');
    assert.equal(capturedParams[3], '2025-01-01T15:00:00.000Z');
});
