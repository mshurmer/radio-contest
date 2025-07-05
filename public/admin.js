// public/admin.js

const input = document.getElementById('adminYearsLicensed');
const saveBtn = document.getElementById('saveYearsBtn');
const status = document.getElementById('adminStatus');
const clearLogBtn = document.getElementById('clearLogBtn'); // ✅ New

// Load years licensed
fetch('/admin/yearsLicensed')
    .then(res => res.json())
    .then(data => {
        if (data.success) input.value = data.value;
        else status.textContent = '❌ Failed to load';
    });

// Save years licensed
saveBtn.addEventListener('click', async () => {
    const value = parseInt(input.value, 10);
    if (isNaN(value) || value < 0 || value > 999) {
        status.textContent = '❌ Invalid value';
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
        status.textContent = '✅ Saved';
    } else {
        status.textContent = '❌ ' + (result.message || 'Failed');
    }
});
//the calibro formate code

const cabrilloContainer = document.getElementById('cabrilloFields');
const cabrilloStatus = document.getElementById('cabrilloStatus');
const saveCabrilloBtn = document.getElementById('saveCabrilloBtn');

const HEADER_KEYS = [
    'CALLSIGN', 'CONTEST', 'CATEGORY-OPERATOR', 'CATEGORY-BAND',
    'CATEGORY-MODE', 'CATEGORY-TRANSMITTER', 'CATEGORY-POWER',
    'NAME', 'EMAIL', 'CLUB', 'ADDRESS', 'SOAPBOX'
];

// Load existing values
fetch('/admin/cabrilloHeaders')
    .then(res => res.json())
    .then(data => {
        if (!data.success) return cabrilloStatus.textContent = '❌ Failed to load headers';
        HEADER_KEYS.forEach(key => {
            const group = document.createElement('div');
            group.className = 'mb-2';
            group.innerHTML = `
                <label class="form-label">${key}</label>
                <input type="text" class="form-control" id="cabrillo-${key}" value="${data.headers[key] || ''}">
            `;
            cabrilloContainer.appendChild(group);
        });
    });

saveCabrilloBtn.addEventListener('click', async () => {
    const password = prompt('Enter admin password:');
    if (!password) return;

    const headers = {};
    HEADER_KEYS.forEach(key => {
        headers[key] = document.getElementById(`cabrillo-${key}`).value.trim();
    });

    const res = await fetch('/admin/cabrilloHeaders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, password })
    });

    const result = await res.json();
    cabrilloStatus.textContent = result.success ? '✅ Headers saved' : '❌ Save failed';
});





// ✅ Clear All Logs handler
if (clearLogBtn) {
    clearLogBtn.addEventListener('click', async () => {
        const confirmClear = confirm('⚠️ Are you sure you want to DELETE ALL QSOs?');
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
                alert('✅ All QSOs have been cleared.');
            } else {
                alert('❌ Failed: ' + (data.message || 'Unknown error'));
            }
        } catch (err) {
            alert('❌ Server error: ' + err.message);
        }
    });
}
