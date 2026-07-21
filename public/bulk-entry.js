const tableBody = document.querySelector('#bulkTable tbody');
const summary = document.getElementById('summary');
const operatorInput = document.getElementById('operatorName');
const submitButton = document.getElementById('submitRows');

const bands = ['160m', '80m', '40m', '20m', '15m', '10m', '23cm'];
const modes = ['SSB', 'CW', 'RTTY'];
let defaultSentReport = '';

function localDateTimeValue(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function options(values, selected) {
    return values.map(value =>
        `<option value="${value}"${value === selected ? ' selected' : ''}>${value}</option>`
    ).join('');
}

function addRow(values = {}) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input class="form-control qso-time" type="datetime-local" value="${values.time || localDateTimeValue()}" required></td>
        <td><input class="form-control callsign" type="text" value="${values.callsign || ''}" required></td>
        <td><select class="form-select band">${options(bands, values.band || '40m')}</select></td>
        <td><select class="form-select mode">${options(modes, values.mode || 'SSB')}</select></td>
        <td><input class="form-control sent-report" type="text" value="${values.sentReport || defaultSentReport}"></td>
        <td><input class="form-control rx-report" type="text" value="${values.rxReport || ''}"></td>
        <td><input class="form-control comments" type="text" value="${values.comments || ''}"></td>
        <td class="text-center"><input class="form-check-input non-contest" type="checkbox"></td>
        <td class="text-center"><input class="form-check-input qsl-requested" type="checkbox"></td>
        <td class="result-cell text-muted"></td>
        <td><button class="btn btn-sm btn-outline-danger remove-row" type="button">Remove</button></td>
    `;
    tableBody.appendChild(row);
    row.querySelector('.callsign').focus();
}

function rowData(row) {
    const enteredTime = row.querySelector('.qso-time').value;
    const parsedTime = new Date(enteredTime);
    return {
        time: Number.isNaN(parsedTime.getTime()) ? enteredTime : parsedTime.toISOString(),
        callsign: row.querySelector('.callsign').value.trim(),
        band: row.querySelector('.band').value,
        mode: row.querySelector('.mode').value,
        sentReport: row.querySelector('.sent-report').value.trim(),
        rxReport: row.querySelector('.rx-report').value.trim(),
        comments: row.querySelector('.comments').value.trim(),
        isNonContest: row.querySelector('.non-contest').checked,
        qslCardRequested: row.querySelector('.qsl-requested').checked
    };
}

function markSaved(row, id) {
    row.dataset.saved = 'true';
    row.classList.remove('table-danger');
    row.classList.add('table-success');
    row.querySelector('.result-cell').textContent = `Saved as QSO #${id}`;
    row.querySelectorAll('input, select').forEach(control => {
        control.disabled = true;
    });
}

function markRejected(row, message) {
    row.classList.remove('table-success');
    row.classList.add('table-danger');
    row.querySelector('.result-cell').textContent = message || 'Not saved';
}

document.getElementById('addRow').addEventListener('click', () => addRow());

tableBody.addEventListener('click', event => {
    if (!event.target.classList.contains('remove-row')) return;
    event.target.closest('tr').remove();
    if (tableBody.rows.length === 0) addRow();
});

operatorInput.value = localStorage.getItem('operatorName') || '';
operatorInput.addEventListener('input', () => {
    localStorage.setItem('operatorName', operatorInput.value.trim());
});

submitButton.addEventListener('click', async () => {
    const rows = Array.from(tableBody.rows).filter(row => row.dataset.saved !== 'true');
    if (rows.length === 0) {
        summary.className = 'mt-3 alert alert-info';
        summary.textContent = 'There are no unsaved rows.';
        return;
    }

    rows.forEach(row => {
        row.classList.remove('table-danger');
        row.querySelector('.result-cell').textContent = 'Checking…';
    });

    submitButton.disabled = true;
    summary.className = 'mt-3 alert alert-info';
    summary.textContent = `Checking ${rows.length} row(s)…`;

    try {
        const response = await fetch('/log/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operatorName: operatorInput.value.trim(),
                qsos: rows.map(rowData)
            })
        });
        const data = await response.json();

        if (!response.ok || !Array.isArray(data.results)) {
            throw new Error(data.message || 'The server could not process the rows');
        }

        data.results.forEach(result => {
            const row = rows[result.index];
            if (!row) return;
            if (result.success) markSaved(row, result.id);
            else markRejected(row, result.message);
        });

        summary.className = data.failed === 0
            ? 'mt-3 alert alert-success'
            : 'mt-3 alert alert-warning';
        summary.textContent = `Saved ${data.saved} row(s); ${data.failed} row(s) need attention.`;

        if (data.failed === 0) addRow();
    } catch (error) {
        rows.forEach(row => markRejected(row, error.message));
        summary.className = 'mt-3 alert alert-danger';
        summary.textContent = 'Nothing was saved: ' + error.message;
    } finally {
        submitButton.disabled = false;
    }
});

fetch('/admin/yearsLicensed')
    .then(response => response.json())
    .then(data => {
        if (!data.success) return;
        defaultSentReport = `59${String(data.value).padStart(3, '0')}`;
        tableBody.querySelectorAll('.sent-report').forEach(input => {
            if (!input.value) input.value = defaultSentReport;
        });
    })
    .catch(() => {});

addRow();
