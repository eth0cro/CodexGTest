const loginCard = document.getElementById('loginCard');
const adminCard = document.getElementById('adminCard');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const startInput = document.getElementById('startInput');
const endInput = document.getElementById('endInput');
const digitsInput = document.getElementById('digitsInput');
const typeInput = document.getElementById('typeInput');
const generateBtn = document.getElementById('generateBtn');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const pinsList = document.getElementById('pinsList');

function setMessage(type, text) {
  statusEl.textContent = type === 'status' ? text : '';
  errorEl.textContent = type === 'error' ? text : '';
}

function showLogin(errorText = '') {
  loginCard.classList.remove('hidden');
  adminCard.classList.add('hidden');
  loginError.textContent = errorText;
}

function showAdmin() {
  loginCard.classList.add('hidden');
  adminCard.classList.remove('hidden');
}

function toIsoFromLocal(localValue) {
  if (!localValue) return null;
  return new Date(localValue).toISOString();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({ ok: false, code: 'BAD_RESPONSE' }));

  if (response.status === 401) {
    showLogin('UNAUTHORIZED');
    throw new Error(data.message || data.code || 'UNAUTHORIZED');
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.message || data.code || `HTTP_${response.status}`);
  }

  return data;
}

function formatLeft(left) {
  if (!left) return '';
  return `${left.days}d ${left.hours}h ${left.minutes}m`;
}

function pinLi(pin) {
  const li = document.createElement('li');
  li.innerHTML = `<code>${pin.pin}</code> — ${pin.status} (${formatLeft(pin.left)})
    <span class="meta"> | Type: ${pin.type || '-'}</span>
    <button type="button" data-pin="${pin.pin}">Delete</button>`;
  li.querySelector('button').addEventListener('click', async () => {
    try {
      await api(`/api/admin/pins/${encodeURIComponent(pin.pin)}`, { method: 'DELETE' });
      setMessage('status', `Deleted PIN ${pin.pin}`);
      await loadPins();
    } catch (err) {
      setMessage('error', err.message);
    }
  });
  return li;
}

async function loadPins() {
  const data = await api('/api/admin/pins');
  pinsList.innerHTML = '';
  data.pins.forEach((pin) => pinsList.appendChild(pinLi(pin)));
}

async function checkSession() {
  try {
    const me = await api('/api/admin/me');
    if (me.isAdmin) {
      showAdmin();
      await loadPins();
      return;
    }
    showLogin();
  } catch (err) {
    showLogin(err.message);
  }
}

loginBtn.addEventListener('click', async () => {
  loginError.textContent = '';
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: passwordInput.value }),
    });
    passwordInput.value = '';
    showAdmin();
    await loadPins();
    setMessage('status', 'Logged in successfully.');
  } catch (err) {
    loginError.textContent = err.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/admin/logout', { method: 'POST' });
  } finally {
    showLogin();
  }
});

generateBtn.addEventListener('click', async () => {
  setMessage('status', '');
  setMessage('error', '');

  const start = toIsoFromLocal(startInput.value);
  const end = toIsoFromLocal(endInput.value);
  const digits = Number(digitsInput.value || 4);
  const type = typeInput.value;

  if (!start || !end) {
    setMessage('error', 'Please provide both start and end datetime.');
    return;
  }

  generateBtn.disabled = true;
  try {
    const result = await api('/api/admin/pins', {
      method: 'POST',
      body: JSON.stringify({ start, end, digits, type }),
    });
    setMessage('status', `PIN generated: ${result.pin.pin} (Type: ${result.pin.type})`);
    await loadPins();
  } catch (err) {
    setMessage('error', err.message);
  } finally {
    generateBtn.disabled = false;
  }
});

checkSession();
