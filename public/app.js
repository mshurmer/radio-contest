// ---------------------- Helper Functions First ----------------------
const socket = io();

let operatorName = localStorage.getItem('operatorName') || 'Guest';
localStorage.setItem('operatorName', operatorName);

let isLoggingNonContest = false;
let isNonContestMode = false;
let licenseYears = 0;

function formatShortDate(dateStr) {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function applyCallsignFilter() {
    const callsignFilter = document.getElementById('callsign').value.toUpperCase();
    const bandFilter = document.getElementById('band').value;
    const modeFilter = document.getElementById('mode').value;
    const rows = document.querySelectorAll('#qsoTable tbody tr');

    rows.forEach(row => {
        const rowCallsign = row.cells[1].textContent.toUpperCase();
        const rowBand = row.cells[2].textContent;
        const rowMode = row.cells[3].textContent;
        const match = rowCallsign.includes(callsignFilter) && (bandFilter === '' || rowBand === bandFilter) && (modeFilter === '' || rowMode === modeFilter);
        row.style.display = match ? '' : 'none';
    });
}

async function loadContacts() {
    const tableBody = document.querySelector('#qsoTable tbody');
    try {
        
        const res = await fetch('/log');
        const qsos = await res.json();
        console.log('📥 Loaded QSOs:', qsos);
        tableBody.innerHTML = '';
        const now = new Date();
        const threeHoursMs = 3 * 60 * 60 * 1000;
        const selectedBand = document.getElementById('band').value;
        const selectedMode = document.getElementById('mode').value;

        console.log('📥 Loaded QSOs:', qsos);

        qsos.forEach(qso => {
            const qsoTime = new Date(qso.time);
            const timeSince = now - qsoTime;
            const isRecentSameBandMode = (qso.band === selectedBand && qso.mode === selectedMode && timeSince < threeHoursMs);
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
                <td><span class="btn-group"><button class="edit-btn">✏️</button><button class="delete-btn">🗑️</button></span></td>`;
            row.addEventListener('click', () => {
                if (!row.classList.contains('editing')) {
                    document.getElementById('callsign').value = qso.callsign;
                    document.getElementById('rxReport').value = qso.rxReport || '';
                    document.getElementById('comments').value = qso.comments || '';
                    document.getElementById('callsign').focus();
                    document.getElementById('qsoId').value = qso.id;
                }
            });
            tableBody.appendChild(row);
        });
        applyCallsignFilter();
    } catch (err) {
        console.error('Failed to load contacts:', err);
    }
}

async function loadLicenseYears() {
    const res = await fetch('/admin/yearsLicensed');
    const data = await res.json();
    if (data.success) {
        licenseYears = data.value;
        const yearsField = document.getElementById('adminYearsLicensed');
        if (yearsField) yearsField.value = licenseYears;
        document.getElementById('sentReport').value = `59${String(licenseYears).padStart(3, '0')}`;
    }
}

function sendStatusUpdate() {
    const band = document.getElementById('band').value;
    const mode = document.getElementById('mode').value;
    socket.emit('statusUpdate', { band, mode, name: operatorName });
}

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

socket.on('bandWarning', (message) => {
    const bandWarningDiv = document.getElementById('bandWarning');
    console.log('⚠️ bandWarning received:', message);
    bandWarningDiv.textContent = message || '';
});

socket.on('newQSO', () => {
    console.log('🔄 Received newQSO event, reloading table...');
    loadContacts();
});



window.addEventListener('DOMContentLoaded', () => {
    loadContacts();
    loadLicenseYears();

    document.getElementById('operatorName').value = operatorName;
    document.getElementById('callsign').focus();
    const initialBand = document.getElementById('band').value;
    socket.emit('setBand', initialBand);  // 🔁 Immediately notify server of band

    sendStatusUpdate();  // ✅ Also sends name, band, and mode


    document.getElementById('callsign').addEventListener('input', applyCallsignFilter);
    document.getElementById('band').addEventListener('change', () => {
        const selectedBand = document.getElementById('band').value;
        console.log('📡 Band changed:', selectedBand);
        socket.emit('setBand', selectedBand);
        sendStatusUpdate();
    });
    document.getElementById('mode').addEventListener('change', sendStatusUpdate);

    document.getElementById('operatorName').addEventListener('input', () => {
        operatorName = document.getElementById('operatorName').value.trim();
        localStorage.setItem('operatorName', operatorName);
        sendStatusUpdate();
    });

    document.getElementById('logNonContestBtn').addEventListener('click', () => {
        isLoggingNonContest = true;
        document.getElementById('qsoForm').requestSubmit();
    });

    document.getElementById('clearEntry').addEventListener('click', () => {
        document.getElementById('callsign').value = '';
        document.getElementById('rxReport').value = '';
        document.getElementById('comments').value = '';
        document.getElementById('callsign').focus();
        sendStatusUpdate();
    });

    document.getElementById('qsoTable').addEventListener('click', async (e) => {
        const row = e.target.closest('tr');  // ✅ Make sure this line is included first
        if (!row) return;

        const qsoId = row.getAttribute('data-id');

        // 🗑️ Handle delete button
        if (e.target.classList.contains('delete-btn')) {
            const confirmed = confirm('🗑️ Are you sure you want to delete this QSO?');
            if (!confirmed) return;

            try {
                const res = await fetch(`/log/${qsoId}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    row.remove();
                } else {
                    alert('❌ Failed to delete QSO: ' + (data.message || 'Unknown error'));
                }
            } catch (err) {
                alert('❌ Error deleting QSO: ' + err.message);
            }
        }

        // ✏️ Handle edit button
        if (e.target.classList.contains('edit-btn')) {
            const callsign = row.cells[1].textContent;
            const band = row.cells[2].textContent;
            const mode = row.cells[3].textContent;
            const sentReport = row.cells[5].textContent;
            const rxReport = row.cells[6].textContent;
            const comments = row.cells[7].textContent;

            document.getElementById('callsign').value = callsign;
            document.getElementById('band').value = band;
            document.getElementById('mode').value = mode;
            document.getElementById('sentReport').value = sentReport;
            document.getElementById('rxReport').value = rxReport;
            document.getElementById('comments').value = comments;
            document.getElementById('qsoId').value = qsoId;
        }
    });

    document.getElementById('qsoForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const qsoId = document.getElementById('qsoId').value;  // ← hidden field
        const callsign = document.getElementById('callsign').value.trim();
        const band = document.getElementById('band').value;
        const mode = document.getElementById('mode').value;
        const sentReport = document.getElementById('sentReport').value;
        const rxReport = document.getElementById('rxReport').value;
        const comments = document.getElementById('comments').value;
        const isNonContest = isLoggingNonContest ? 1 : 0;

        const qsoData = {
            callsign,
            band,
            mode,
            sentReport,
            rxReport,
            comments,
            isNonContest
        };

        try {
            let res;
            if (qsoId) {
                // Editing an existing QSO
                res = await fetch(`/log/${qsoId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(qsoData)
                });
            } else {
                // New QSO
                res = await fetch('/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(qsoData)
                });
            }

            const data = await res.json();
            console.log('📨 Server responded:', data);

            if (data.success) {
                document.getElementById('qsoForm').reset();
                document.getElementById('sentReport').value = `59${String(licenseYears).padStart(3, '0')}`;
                document.getElementById('qsoId').value = ''; // Reset edit state
                await loadContacts();
                document.getElementById('callsign').focus();
                isLoggingNonContest = false;
            } else {
                alert('❌ ' + data.message);
            }
        } catch (err) {
            console.error('❌ Submit failed:', err);
            alert('❌ Failed to save QSO');
        }
    });



});
