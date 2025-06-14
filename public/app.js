
// ---------------------- Helper Functions First ----------------------
const clearLogBtn = document.getElementById('clearLogBtn');
const socket = io();
let operatorName = localStorage.getItem('operatorName');
if (!operatorName) {
    operatorName = 'Guest';
    localStorage.setItem('operatorName', operatorName);
}
let isLoggingNonContest = false;
let isNonContestMode = false;

socket.on('userStatusUpdate', (statuses) => {
    const statusDiv = document.getElementById('userStatus');
    statusDiv.innerHTML = '';

    const entries = Object.values(statuses);
    if (entries.length === 0) {
        statusDiv.textContent = 'No operators on air';
        return;
    }

    entries.forEach(({ band, mode, name }) => {
        const label = document.createElement('div');
        label.textContent = `${name ? name + ' – ' : ''}${band} ${mode}`;
        statusDiv.appendChild(label);
    });
});



let licenseYears = 0;

async function loadLicenseYears() {
    const res = await fetch('/admin/yearsLicensed');
    const data = await res.json();
    if (data.success) {
        licenseYears = data.value;
        document.getElementById('adminYearsLicensed').value = licenseYears;
        console.log('Years licensed loaded:', licenseYears);
        document.getElementById('sentReport').value = `59${String(licenseYears).padStart(3, '0')}`;
    } else {
        console.error('❌ Failed to load years licensed');
    }
}


function formatShortDate(dateStr) {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addContactRow(qso) {
    const row = `<tr>
        <td>${new Date(qso.time).toLocaleString()}</td>
        <td>${qso.callsign}</td>
        <td>${qso.band}</td>
        <td>${qso.mode}</td>
        <td>${qso.points}</td>
    </tr>`;
    document.querySelector('#qsoTable tbody').insertAdjacentHTML('afterbegin', row);
}

function applyCallsignFilter() {
    const callsignInput = document.getElementById('callsign');
    const bandSelect = document.getElementById('band');
    const modeSelect = document.getElementById('mode');

    const callsignFilter = callsignInput.value.toUpperCase();
    const bandFilter = bandSelect.value;
    const modeFilter = modeSelect.value;

    const rows = document.querySelectorAll('#qsoTable tbody tr');

    rows.forEach(row => {
        const rowCallsign = row.cells[1].textContent.toUpperCase();
        const rowBand = row.cells[2].textContent;
        const rowMode = row.cells[3].textContent;

        const matchCallsign = rowCallsign.includes(callsignFilter);
        const matchBand = (bandFilter === '' || rowBand === bandFilter);
        const matchMode = (modeFilter === '' || rowMode === modeFilter);

        row.style.display = (matchCallsign && matchBand && matchMode) ? '' : 'none';
    });
}

async function loadContacts() {
    const tableBody = document.querySelector('#qsoTable tbody');
    try {
        const res = await fetch('/log');
        const qsos = await res.json();
        tableBody.innerHTML = '';

        const now = new Date();
        const threeHoursMs = 3 * 60 * 60 * 1000;

        const selectedBand = document.getElementById('band').value;
        const selectedMode = document.getElementById('mode').value;

        qsos.forEach(qso => {
            const qsoTime = new Date(qso.time);
            const timeSince = now - qsoTime;

            let isRecentSameBandMode = false;
            if (selectedBand && selectedMode) {
                isRecentSameBandMode =
                    qso.band === selectedBand &&
                    qso.mode === selectedMode &&
                    timeSince < threeHoursMs;
            }

            const row = document.createElement('tr');
            row.setAttribute('data-id', qso.id);
            if (qso.isNonContest) row.classList.add('non-contest-row');
            if (isRecentSameBandMode) row.classList.add('qso-invalid');

            row.innerHTML = `
                <td>${formatShortDate(qso.time)}</td>
                <td>${qso.callsign}</td>
                <td>${qso.band}</td>
                <td>${qso.mode}</td>
                <td>${qso.isNonContest ? 0 : qso.points}</td>
                <td>${qso.sentReport || ''}</td>
                <td>${qso.rxReport || ''}</td>
                <td>${qso.comments || ''}</td>
                <td>
                    <span class="btn-group">
                        <button class="edit-btn">✏️</button>
                        <button class="delete-btn">🗑️</button>
                    </span>
                </td>
            `;
            row.addEventListener('click', () => {
                if (row.classList.contains('editing')) return;
                document.getElementById('callsign').value = qso.callsign;
                document.getElementById('rxReport').value = qso.rxReport || '';
                document.getElementById('comments').value = qso.comments || '';
                document.getElementById('callsign').focus();
                document.getElementById('qsoId').value = qso.id;
            });
            tableBody.appendChild(row);
        });

        applyCallsignFilter();
    } catch (err) {
        console.error('Failed to load contacts:', err);
    }
}

// ---------------------- DOM Initialisation ----------------------

window.addEventListener('DOMContentLoaded', () => {
    loadContacts();
    loadLicenseYears(); // ✅ This is the key line

    document.getElementById('callsign').focus(); 
    document.getElementById('operatorName').value = operatorName;
    document.getElementById('callsign').addEventListener('input', applyCallsignFilter);

    sendStatusUpdate();

  
    document.getElementById('operatorName').addEventListener('input', () => {
        operatorName = document.getElementById('operatorName').value.trim();
        localStorage.setItem('operatorName', operatorName);
        sendStatusUpdate();
    });
document.getElementById('band').addEventListener('change', sendStatusUpdate);
document.getElementById('mode').addEventListener('change', sendStatusUpdate);

});

document.getElementById('logNonContestBtn').addEventListener('click', () => {
    isLoggingNonContest = true;
    document.getElementById('qsoForm').requestSubmit(); // Submits the form
});


document.getElementById('clearEntry').addEventListener('click', () => {
    document.getElementById('callsign').value = '';
    document.getElementById('rxReport').value = '';
    document.getElementById('comments').value = '';
    document.getElementById('callsign').focus();
    sendStatusUpdate(); // ✅ Emit band/mode right after load
});

function sendStatusUpdate() {
    const band = document.getElementById('band').value;
    const mode = document.getElementById('mode').value;
    socket.emit('statusUpdate', { band, mode, name:operatorName });
}






clearLogBtn.addEventListener('click', async () => {
    const confirmClear = confirm('⚠️ Are you sure you want to delete all QSOs? This cannot be undone.');
    if (!confirmClear) return;

    const password = prompt('Enter admin password:');
    if (!password) return;

    try {
        const res = await fetch('/admin/clearLog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await res.json();

        if (data.success) {
            alert('✅ QSO log cleared!');
            loadContacts(); // Refresh table
        } else {
            alert('❌ Failed to clear log: ' + (data.message || 'Unknown error'));
        }
    } catch (err) {
        alert('❌ Network or server error: ' + err.message);
        console.error('Clear log error:', err);
    }
});



const adminInput = document.getElementById('adminYearsLicensed');
const saveBtn = document.getElementById('saveYearsBtn');
const adminStatus = document.getElementById('adminStatus');

saveBtn.addEventListener('click', async () => {
    const value = parseInt(adminInput.value, 10);
    if (isNaN(value) || value < 0 || value > 999) {
        adminStatus.textContent = '❌ Invalid value';
        adminInput.value = licenseYears; // Reset to previous value
        return;
    }

    const password = prompt('Enter admin password:');
    if (!password) return;

    const res = await fetch('/admin/yearsLicensed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, password })
    });

    const result = await res.json();
    if (result.success) {
        adminStatus.textContent = '✅ Updated successfully';
        licenseYears = value;
        document.getElementById('sentReport').value = `59${String(licenseYears).padStart(3, '0')}`;
    } else {
        adminStatus.textContent = '❌ Failed to update: ' + (result.message || 'Unknown error');
        adminInput.value = licenseYears; // Revert
    }
});

const form = document.getElementById('qsoForm');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const isNonContest = isNonContestMode ? 1 : 0;

    const qsoId = document.getElementById('qsoId').value;
    const isEdit = !!qsoId;
    const callsign = document.getElementById('callsign').value.trim().toUpperCase();
    const band = document.getElementById('band').value;
    const mode = document.getElementById('mode').value;
    const rxReport = document.getElementById('rxReport').value.trim().toUpperCase();
    const sentReport = document.getElementById('sentReport').value.trim();
    const comments = document.getElementById('comments').value.trim();
    const qsoData = {
        callsign,
        band,
        mode,
        rxReport,
        sentReport,
        comments,
        isNonContest
    };

    try {
        const url = isEdit ? `/log/${qsoId}` : '/log';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(qsoData)
        });

        const data = await res.json();

        if (data.success) {
            loadContacts();
            document.getElementById('callsign').value = '';
            document.getElementById('rxReport').value = '';
            document.getElementById('comments').value = '';
            document.getElementById('sentReport').value = `59${String(licenseYears).padStart(3, '0')}`;
            document.getElementById('qsoId').value = ''; // ✅ clear edit mode
            document.getElementById('callsign').focus();
        } else {
            alert('❌ Failed to log QSO: ' + (data.message || 'Unknown error'));
        }
    } catch (err) {
        alert('❌ Error connecting to server: ' + err.message);
    }
});

document.getElementById('logNonContestBtn').addEventListener('click', async () => {
    const callsign = document.getElementById('callsign').value.trim().toUpperCase();
    const band = document.getElementById('band').value;
    const mode = document.getElementById('mode').value;
    const rxReport = document.getElementById('rxReport').value.trim().toUpperCase();
    const sentReport = document.getElementById('sentReport').value.trim();
    const comments = document.getElementById('comments').value.trim();

    if (!callsign || !rxReport || !band || !mode) {
        alert('❌ Please complete all required fields before logging.');
        return;
    }

    try {
        const res = await fetch('/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callsign, band, mode, rxReport, sentReport, comments, isNonContest: 1 })
        });

        const data = await res.json();
        if (data.success) {
            loadContacts();
            document.getElementById('callsign').value = '';
            document.getElementById('rxReport').value = '';
            document.getElementById('comments').value = '';
            document.getElementById('sentReport').value = `59${String(licenseYears).padStart(3, '0')}`;
            document.getElementById('callsign').focus();
        } else {
            alert('❌ Failed to log non-contest QSO: ' + (data.message || 'Unknown error'));
        }
    } catch (err) {
        alert('❌ Network error: ' + err.message);
    }
});
