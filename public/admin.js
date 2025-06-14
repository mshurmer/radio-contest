// public/admin.js
const input = document.getElementById('adminYearsLicensed');
const saveBtn = document.getElementById('saveYearsBtn');
const status = document.getElementById('adminStatus');

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
