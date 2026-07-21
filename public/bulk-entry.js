const tableBody = document.querySelector('#bulkTable tbody');
const summary = document.getElementById('summary');
const operatorInput = document.getElementById('operatorName');
const filterInput = document.getElementById('filterCalls');
const submitButton = document.getElementById('submitRows');

const bands = ['160m', '80m', '40m', '20m', '15m', '10m', '23cm'];
const modes = ['SSB', 'CW', 'RTTY'];
let defaultSentReport = '';

function localDateTimeValue(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function options(values) {
    return values.map(value => `<option value="${value}">${value}</option>`).join('');
}

function addRow(values = {}, id = null) {
    const row = document.createElement('tr');
    row.dataset.existing = id == null ? 'false' : 'true';
    row.dataset.dirty = 'false';
    if (id != null) row.dataset.id = String(id);

    row.innerHTML = `
        <td><input class="form-control qso-time" type="datetime-local" required></td>
        <td><input class="form-control callsign" type="text" required></td>
        <td><select class="form-select band">${options(bands)}</select></td>
        <td><select class="form-select mode">${options(modes)}</select></td>
        <td><input class="form-control sent-report" type="text"></td>
        <td><input class="form-control rx-report" type="text"></td>
        <td><input class="form-control comments" type="text"></td>
        <td class="text-center"><input class="form-check-input non-contest" type="checkbox"></td>
        <td class="text-center"><input class="form-check-input qsl-requested" type="checkbox"></td>
        <td class="result-cell text-muted"></td>
        <td><button class="btn btn-sm btn-outline-danger remove-row" type="button"></button></td>
    `;

    const parsedTime = values.time ? new Date(values.time) : new Date();
    row.querySelector('.qso-time').value = Number.isNaN(parsedTime.getTime())
        ? ''
        : localDateTimeValue(parsedTime);
    row.querySelector('.callsign').value = values.callsign || '';
    row.querySelector('.band').value = values.band || '40m';
    row.querySelector('.mode').value = values.mode || 'SSB';
    row.querySelector('.sent-report').value = values.sentReport || defaultSentReport;
    row.querySelector('.rx-report').value = values.rxReport || '';
    row.querySelector('.comments').value = values.comments || '';
    row.querySelector('.non-contest').checked = Boolean(Number(values.isNonContest));
    row.querySelector('.qsl-requested').checked = Boolean(Number(values.qslCardRequested));
    row.querySelector('.result-cell').textContent = id == null ? 'New row' : 'Saved QSO';
    row.querySelector('.remove-row').textContent = id == null ? 'Remove' : 'Delete';

    tableBody.appendChild(row);
    applyFilter();
    return row;
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
        qslCardRequested: row.querySelector('.qsl-requested').checked,
        operatorName: operatorInput.value.trim()
    };
}

function markSaved(row, id) {
    row.dataset.existing = 'true';
    row.dataset.dirty = 'false';
    row.dataset.id = String(id);
    row.classList.remove('table-danger');
    row.classList.add('table-success');
    row.querySelector('.result-cell').textContent = `Saved as QSO #${id}`;
    row.querySelector('.remove-row').textContent = 'Delete';
}

function markRejected(row, message) {
    row.classList.remove('table-success');
    row.classList.add('table-danger');
    row.querySelector('.result-cell').textContent = message || 'Not saved';
}

function applyFilter() {
    const query = filterInput.value.trim().toUpperCase();
    Array.from(tableBody.rows).forEach(row => {
        const callsign = row.querySelector('.callsign').value.toUpperCase();
        const comments = row.querySelector('.comments').value.toUpperCase();
        row.style.display = !query || callsign.includes(query) || comments.includes(query) ? '' : 'none';
    });
}

async function loadRows() {
    summary.className = 'mt-3 alert alert-info';
    summary.textContent = 'Loading saved QSOs…';

    try {
        const [qsoResponse, settingsResponse] = await Promise.all([
            fetch('/log'),
            fetch('/admin/yearsLicensed')
        ]);
        if (!qsoResponse.ok) throw new Error('Could not load saved QSOs');

        const qsos = await qsoResponse.json();
        if (settingsResponse.ok) {
            const settings = await settingsResponse.json();
            if (settings.success) {
                defaultSentReport = `59${String(settings.value).padStart(3, '0')}`;
            }
        }

        tableBody.innerHTML = '';
        qsos.forEach(qso => addRow(qso, qso.id));
        addRow();

        summary.className = 'mt-3 alert alert-success';
        summary.textContent = `Loaded ${qsos.length} saved QSO(s). Edit any row or add new ones below.`;
    } catch (error) {
        tableBody.innerHTML = '';
        addRow();
        summary.className = 'mt-3 alert alert-danger';
        summary.textContent = error.message;
    }
}

document.getElementById('addRow').addEventListener('click', () => {
    const row = addRow();
    row.querySelector('.callsign').focus();
});

filterInput.addEventListener('input', applyFilter);

tableBody.addEventListener('input', event => {
    const row = event.target.closest('tr');
    if (!row) return;
    row.dataset.dirty = 'true';
    row.classList.remove('table-success', 'table-danger');
    row.querySelector('.result-cell').textContent =
        row.dataset.existing === 'true' ? 'Unsaved changes' : 'New row';
    applyFilter();
});

tableBody.addEventListener('change', event => {
    const row = event.target.closest('tr');
    if (!row) return;
    row.dataset.dirty = 'true';
    row.classList.remove('table-success', 'table-danger');
    row.querySelector('.result-cell').textContent =
        row.dataset.existing === 'true' ? 'Unsaved changes' : 'New row';
});

tableBody.addEventListener('click', async event => {
    if (!event.target.classList.contains('remove-row')) return;
    const row = event.target.closest('tr');

    if (row.dataset.existing !== 'true') {
        row.remove();
        if (tableBody.rows.length === 0) addRow();
        return;
    }

    const callsign = row.querySelector('.callsign').value || `QSO #${row.dataset.id}`;
    if (!confirm(`Delete ${callsign} from the database?`)) return;

    event.target.disabled = true;
    try {
        const operator = encodeURIComponent(operatorInput.value.trim());
        const response = await fetch(`/log/${row.dataset.id}?operator=${operator}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Delete failed');
        row.remove();
        summary.className = 'mt-3 alert alert-success';
        summary.textContent = `${callsign} was deleted.`;
    } catch (error) {
        markRejected(row, error.message);
        event.target.disabled = false;
    }
});

operatorInput.value = localStorage.getItem('operatorName') || '';
operatorInput.addEventListener('input', () => {
    localStorage.setItem('operatorName', operatorInput.value.trim());
});

submitButton.addEventListener('click', async () => {
    const changedRows = Array.from(tableBody.rows).filter(row =>
        row.dataset.existing === 'true' && row.dataset.dirty === 'true'
    );
    const newRows = Array.from(tableBody.rows).filter(row =>
        row.dataset.existing !== 'true' && row.dataset.dirty === 'true'
    );

    if (changedRows.length === 0 && newRows.length === 0) {
        summary.className = 'mt-3 alert alert-info';
        summary.textContent = 'There are no new or changed rows.';
        return;
    }

    let saved = 0;
    let failed = 0;
    submitButton.disabled = true;
    summary.className = 'mt-3 alert alert-info';
    summary.textContent = `Saving ${changedRows.length + newRows.length} row(s)…`;

    for (const row of changedRows) {
        row.querySelector('.result-cell').textContent = 'Checking…';
        try {
            const response = await fetch(`/log/${row.dataset.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rowData(row))
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || 'Update failed');
            markSaved(row, row.dataset.id);
            saved++;
        } catch (error) {
            markRejected(row, error.message);
            failed++;
        }
    }

    if (newRows.length > 0) {
        newRows.forEach(row => {
            row.querySelector('.result-cell').textContent = 'Checking…';
        });

        try {
            const response = await fetch('/log/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operatorName: operatorInput.value.trim(),
                    qsos: newRows.map(rowData)
                })
            });
            const data = await response.json();
            if (!response.ok || !Array.isArray(data.results)) {
                throw new Error(data.message || 'The server could not process the new rows');
            }

            data.results.forEach(result => {
                const row = newRows[result.index];
                if (!row) return;
                if (result.success) {
                    markSaved(row, result.id);
                    saved++;
                } else {
                    markRejected(row, result.message);
                    failed++;
                }
            });
        } catch (error) {
            newRows.forEach(row => markRejected(row, error.message));
            failed += newRows.length;
        }
    }

    if (!Array.from(tableBody.rows).some(row => row.dataset.existing !== 'true')) {
        addRow();
    }

    summary.className = failed === 0
        ? 'mt-3 alert alert-success'
        : 'mt-3 alert alert-warning';
    summary.textContent = `Saved ${saved} row(s); ${failed} row(s) need attention.`;
    submitButton.disabled = false;
});

loadRows();
