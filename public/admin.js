const input = document.getElementById('adminYearsLicensed');
const saveBtn = document.getElementById('saveYearsBtn');
const status = document.getElementById('adminStatus');
const clearLogBtn = document.getElementById('clearLogBtn');

// Load years licensed
fetch('/admin/yearsLicensed')
    .then(res => res.json())
    .then(data => {
        if (data.success) input.value = data.value;
        else status.textContent = '❌ Failed to load';
    });

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

const cabrilloContainer = document.getElementById('cabrilloFields');
const cabrilloStatus = document.getElementById('cabrilloStatus');
const saveCabrilloBtn = document.getElementById('saveCabrilloBtn');

const HEADER_KEYS = [
    'LOCATION', 'CALLSIGN', 'CLUB', 'CONTEST', 'CATEGORY-OPERATOR', 'CATEGORY-BAND',
    'CATEGORY-MODE', 'CATEGORY-POWER', 'CATEGORY-STATION', 'CATEGORY-TRANSMITTER',
    'CLAIMED-SCORE', 'OPERATORS', 'EMAIL', 'NAME', 'ADDRESS', 'ADDRESS-CITY',
    'ADDRESS-STATE-PROVINCE', 'ADDRESS-POSTALCODE', 'CREATED-BY', 'SOAPBOX'
];

const DROPDOWN_OPTIONS = {
    'CATEGORY-OPERATOR': ['', 'SINGLE-OP', 'MULTI-OP', 'CHECKLOG'],
    'CATEGORY-BAND': ['', 'ALL', '160M', '80M', '40M', '20M', '15M', '10M'],
    'CATEGORY-MODE': ['', 'SSB', 'CW', 'FM', 'MIXED'],
    'CATEGORY-POWER': ['', 'HIGH', 'LOW', 'QRP'],
    'CATEGORY-STATION': ['', 'FIXED', 'MOBILE', 'PORTABLE'],
    'CATEGORY-TRANSMITTER': ['', 'ONE', 'TWO', 'UNLIMITED']
};

// Load existing values
fetch('/admin/cabrilloHeaders')
    .then(res => res.json())
    .then(data => {
        if (!data.success) return cabrilloStatus.textContent = '❌ Failed to load headers';
        HEADER_KEYS.forEach(key => {
            const group = document.createElement('div');
            group.className = 'mb-2';

            let inputField = '';

            if (DROPDOWN_OPTIONS[key]) {
                inputField = `<select class="form-select" id="cabrillo-${key}">
                    ${DROPDOWN_OPTIONS[key].map(opt => `
                        <option value="${opt}" ${data.headers[key] === opt ? 'selected' : ''}>${opt}</option>
                    `).join('')}
                </select>`;
            } else {
                inputField = `<input type="text" class="form-control" id="cabrillo-${key}" value="${data.headers[key] || ''}">`;
            }

            group.innerHTML = `
                <label class="form-label">${key}</label>
                ${inputField}
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
const exportBtn = document.getElementById('exportCabrilloBtn');

if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        window.open('/export/cabrillo', '_blank');
    });
}
