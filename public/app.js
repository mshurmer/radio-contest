
let licenseYears = 0;

async function loadLicenseYears() {
    const res = await fetch('/admin/yearsLicensed');
    const data = await res.json();
    if (data.success) {
        licenseYears = data.value;
        document.getElementById('adminYearsLicensed').value = licenseYears;
        console.log('Years licensed loaded:', licenseYears);
        // ✅ Set the default Sent Report value here
        document.getElementById('sentReport').value = `59${String(licenseYears).padStart(3, '0')}`;
    } else {
        console.error('Failed to load years licensed');
    }
}
   
window.addEventListener('DOMContentLoaded', () => {
    loadLicenseYears();
    document.getElementById('clearEntry').addEventListener('click', () => {
        document.getElementById('callsign').value = '';
        document.getElementById('rxReport').value = '';
        document.getElementById('comments').value = '';
        document.getElementById('callsign').focus();
    });


    
 
});

   

   // setBtn.addEventListener('click', () => {
    //    const input = document.getElementById('licenseYears').value;
    //    const value = parseInt(input, 10);

//        if (!isNaN(value) && value >= 0 && value <= 999) {
  //          licenseYears = value;
    //        popup.style.display = 'none';
    //        console.log('Years licensed set to:', licenseYears);
     //   } else {
      //      alert('Please enter a valid number (0–999).');
      //  }
   // });
//});

let autoRefresh = true;
const bandSelect = document.getElementById('band');
const modeSelect = document.getElementById('mode');
const socket = io();

bandSelect.addEventListener('change', loadContacts);
modeSelect.addEventListener('change', loadContacts);




// Listen for real-time updates
socket.on('newQSO', (qso) => {
    console.log('New QSO received:', qso);
    addContactRow(qso);
});

function sendStatusUpdate() {
    const band = document.getElementById('band').value;
    const mode = document.getElementById('mode').value;
    socket.emit('statusUpdate', { band, mode });
}

document.getElementById('band').addEventListener('change', sendStatusUpdate);
document.getElementById('mode').addEventListener('change', sendStatusUpdate);

document.getElementById('clearLogBtn').addEventListener('click', async () => {
    const confirmClear = confirm('⚠️ Are you sure you want to delete all QSOs? This cannot be undone.');
    if (!confirmClear) return;

    const password = prompt('Enter admin password:');
    if (!password) return;

    const res = await fetch('/admin/clearLog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });

    const data = await res.json();

    if (data.success) {
        alert('QSO log cleared!');
        loadContacts();
    } else {
        alert('❌ Failed to clear log: ' + (data.message || 'Unknown error'));
    }
});




socket.on('userStatusUpdate', (statusMap) => {
    const userStatusDiv = document.getElementById('userStatus');
    userStatusDiv.innerHTML = '<strong>Operators on Air:</strong><br>';

    for (const [id, status] of Object.entries(statusMap)) {
        userStatusDiv.innerHTML += `🔊 ${status.band || '—'} ${status.mode || '—'}<br>`;
    }
});


const form = document.getElementById('qsoForm');
const tableBody = document.querySelector('#qsoTable tbody');
const callsignInput = document.getElementById('callsign');

callsignInput.addEventListener('input', applyCallsignFilter);
bandSelect.addEventListener('change', applyCallsignFilter);
modeSelect.addEventListener('change', applyCallsignFilter);



form.addEventListener('submit', async (e) => {
  e.preventDefault();
    const callsign = document.getElementById('callsign').value.trim().toUpperCase();
    const band = document.getElementById('band').value;
    const mode = document.getElementById('mode').value;
    const rxReport = document.getElementById('rxReport').value.trim().toUpperCase();
    const sentReport = `59${String(licenseYears).padStart(3, '0')}`;
    const comments = document.getElementById('comments').value.trim();
    const isNonContest = document.getElementById('nonContest').checked ? 1 : 0;

    if (!callsign || !band || !mode) {
        alert('Please enter a callsign, and select both band and mode before logging.');
        return;
    }

  const res = await fetch('/log', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ callsign, band, mode, rxReport, sentReport, comments, isNonContest })

  });

  const data = await res.json();
  if (data.success) {
    loadContacts();
      // Manually clear only callsign and report fields
      document.getElementById('callsign').value = '';
      document.getElementById('rxReport').value = '';
      callsignInput.value = '';
  } else {
    alert(data.message);
  }
});

async function loadContacts() {
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
            if (qso.isNonContest) {
                row.classList.add('non-contest-row');
            }
            if (isRecentSameBandMode) row.classList.add('qso-invalid');

            row.innerHTML = `
        <td>${formatShortDate(qso.time)}</td>
        <td>${qso.callsign}</td>
        <td>${qso.band}</td>
        <td>${qso.mode}</td>
        <td>${qso.points}</td>
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
                // Prevent fill if row is being edited (optional)
                if (row.classList.contains('editing')) return;

                document.getElementById('callsign').value = qso.callsign;
                document.getElementById('rxReport').value = qso.rxReport || '';
                document.getElementById('comments').value = qso.comments || '';

                // Optional: focus the callsign input for speed
                document.getElementById('callsign').focus();
            });
            tableBody.appendChild(row);
        });

        applyCallsignFilter(); // Keep filters applied
    } catch (err) {
        console.error('Failed to load contacts:', err);
    }
}



document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-btn')) {
        const row = e.target.closest('tr');
        const id = row.getAttribute('data-id');

        if (confirm('Are you sure you want to delete this entry?')) {
            const res = await fetch(`/log/${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) {
                row.remove();
            } else {
                alert('Failed to delete entry.');
            }
        }
    }
});

document.addEventListener('click', async (e) => {
    const row = e.target.closest('tr');
    const id = row?.getAttribute('data-id');

    // 🗑️ Delete
    if (e.target.classList.contains('delete-btn')) {
        if (confirm('Are you sure you want to delete this entry?')) {
            const res = await fetch(`/log/${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) row.remove();
            else alert('Failed to delete entry.');
        }
    }

    // ✏️ Edit
    if (e.target.classList.contains('edit-btn')) {
        autoRefresh = false;

        const row = e.target.closest('tr');
        row.classList.add('editing');

        const cells = row.querySelectorAll('td');
        const callsign = cells[1].textContent.trim();
        const band = cells[2].textContent.trim();
        const mode = cells[3].textContent.trim();
        const sentReport = cells[5].textContent.trim();
        const rxReport = cells[6].textContent.trim();
        const currentComments = cells[7].textContent.trim();
        const isNonContest = row.classList.contains('non-contest-row');

        // Edit fields
        cells[1].innerHTML = `<input type="text" value="${callsign}">`;

        cells[2].innerHTML = `
    <select>
      <option ${band === '160m' ? 'selected' : ''}>160m</option>
      <option ${band === '80m' ? 'selected' : ''}>80m</option>
      <option ${band === '40m' ? 'selected' : ''}>40m</option>
      <option ${band === '20m' ? 'selected' : ''}>20m</option>
      <option ${band === '15m' ? 'selected' : ''}>15m</option>
      <option ${band === '10m' ? 'selected' : ''}>10m</option>
      <option ${band === '23cm' ? 'selected' : ''}>23cm</option>
    </select>`;

        cells[3].innerHTML = `
    <select>
      <option ${mode === 'SSB' ? 'selected' : ''}>SSB</option>
      <option ${mode === 'CW' ? 'selected' : ''}>CW</option>
      <option ${mode === 'RTTY' ? 'selected' : ''}>RTTY</option>
    </select>`;

        cells[5].innerHTML = `<input type="text" value="${sentReport}">`;
        cells[6].innerHTML = `<input type="text" value="${rxReport}">`;
        cells[7].innerHTML = `<textarea class="edit-comment" rows="2">${currentComments}</textarea>`;

        // Edit buttons and checkbox
        cells[8].innerHTML = `
    <button class="save-btn">💾</button>
    <button class="cancel-btn">❌</button>
    <label style="font-size: 0.8em; display:block; margin-top:4px;">
      <input type="checkbox" class="edit-nonContest" ${isNonContest ? 'checked' : ''}> No points
    </label>
  `;
    }



    // 💾 Save
    if (e.target.classList.contains('save-btn')) {
        const row = e.target.closest('tr');
        const cells = row.querySelectorAll('td');

        // Now grab values safely
        const newCallsign = cells[1].querySelector('input').value.trim().toUpperCase();
        const newBand = cells[2].querySelector('select').value;
        const newMode = cells[3].querySelector('select').value;
        const newSentReport = cells[5].querySelector('input').value.trim();
        const newRxReport = cells[6].querySelector('input').value.trim();
        const newComments = cells[7].querySelector('.edit-comment').value.trim();
        const newIsNonContest = cells[8].querySelector('.edit-nonContest')?.checked ? 1 : 0;

        const id = row.getAttribute('data-id');

        const res = await fetch(`/log/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callsign: newCallsign,
                band: newBand,
                mode: newMode,
                sentReport: newSentReport,
                rxReport: newRxReport,
                comments: newComments,
                isNonContest: newIsNonContest
            })
        });

        const result = await res.json();

        if (result.success) {
            row.classList.remove('editing');
            loadContacts(); // ✅ Refresh table
        } else {
            alert('Failed to save edits.');
        }
    }

    if (e.target.classList.contains('cancel-btn')) {
        const row = e.target.closest('tr');
        row.classList.remove('editing');
        autoRefresh = true;
        loadContacts(); // Reload the full table and restore original content
    }


});

function addContactRow(qso) {
    const row = `<tr>
    <td>${new Date(qso.time).toLocaleString()}</td>
    <td>${qso.callsign}</td>
    <td>${qso.band}</td>
    <td>${qso.mode}</td>
    <td>${qso.points}</td>
  </tr>`;
    tableBody.insertAdjacentHTML('afterbegin', row);
}
function applyCallsignFilter() {
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

const resetButton = document.getElementById('resetFilters');

resetButton.addEventListener('click', () => {
    callsignInput.value = '';
    bandSelect.value = '';
    modeSelect.value = '';
    document.getElementById('sentReport').value = `59${String(licenseYears).padStart(3, '0')}`;

    applyCallsignFilter(); // Refresh the table to show all
});

document.getElementById('clearEntry').addEventListener('click', () => {
    document.getElementById('callsign').value = '';
    document.getElementById('rxReport').value = '';
    document.getElementById('comments').value = '';

    applyCallsignFilter(); // Reset table view filter
    document.getElementById('callsign').focus();
});


// Load initially
loadContacts();

// ⏱️ Auto-refresh every 10 seconds
setInterval(() => {
    if (autoRefresh) {
        loadContacts();
    }
}, 10000);
function formatShortDate(dateStr) {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const adminInput = document.getElementById('adminYearsLicensed');
const saveBtn = document.getElementById('saveYearsBtn');
const adminStatus = document.getElementById('adminStatus');

saveBtn.addEventListener('click', async () => {
    const value = parseInt(adminInput.value, 10);
    if (isNaN(value) || value < 0 || value > 999) {
        adminStatus.textContent = '❌ Invalid value';
        return;
    }

    const res = await fetch('/admin/yearsLicensed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
    });

    const result = await res.json();
    if (result.success) {
        adminStatus.textContent = '✅ Updated successfully';
    } else {
        adminStatus.textContent = '❌ Failed to update';
    }
});