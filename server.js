require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');

const { requireAdmin } = require('./auth');
const {
  cleanupExpiredPins,
  countActiveOrFuturePins,
  createPin,
  deletePin,
  getPin,
  listPins,
} = require('./db');
const { createIpRateLimiter } = require('./rateLimit');
const { openGateWithShelly } = require('./shelly');

const app = express();
const port = Number(process.env.PORT || 3001);
const MAX_ACTIVE_OR_FUTURE_PINS = 4;
const PIN_TYPES = new Set(['Obitelj', 'Apartman A0', 'Apartman A1', 'Prijatelji']);

app.set('trust proxy', 1);

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 12,
    },
  })
);

app.use((req, _res, next) => {
  if (process.env.NODE_ENV === 'production' && req.session) {
    req.session.cookie.secure = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ ok: false, code: 'CONFIG_ERROR', message: 'ADMIN_PASSWORD is missing.' });
  }

  if (!password) {
    return res.status(400).json({ ok: false, code: 'PASSWORD_REQUIRED', message: 'Password is required.' });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, code: 'BAD_PASSWORD', message: 'Invalid password.' });
  }

  req.session.isAdmin = true;
  return res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/me', (req, res) => {
  res.json({ ok: true, isAdmin: Boolean(req.session?.isAdmin) });
});

function pinStatus(pin, now = Date.now()) {
  if (pin.start > now) return 'FUTURE';
  if (pin.end > now) return 'ACTIVE';
  return 'EXPIRED';
}

function getTimeLeftParts(target, now = Date.now()) {
  const diffMs = Math.max(0, target - now);
  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return { days, hours, minutes };
}

function normalizePinRow(row, now = Date.now()) {
  const status = pinStatus(row, now);
  const target = status === 'FUTURE' ? row.start : row.end;
  return {
    ...row,
    status,
    left: getTimeLeftParts(target, now),
  };
}

function parseAndValidatePinWindow(startISO, endISO) {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { error: { status: 400, code: 'INVALID_TIME', message: 'start and end must be valid ISO datetimes.' } };
  }
  if (end <= start) {
    return { error: { status: 400, code: 'INVALID_RANGE', message: 'end must be after start.' } };
  }
  return { start, end };
}

function generatePinCode(digits = 4) {
  const lower = 10 ** (digits - 1);
  const upper = 10 ** digits - 1;
  const value = Math.floor(Math.random() * (upper - lower + 1)) + lower;
  return String(value);
}

app.post('/api/admin/pins', requireAdmin, (req, res) => {
  cleanupExpiredPins();

  const digits = Number(req.body?.digits || 4);
  const { start, end, error } = parseAndValidatePinWindow(req.body?.start, req.body?.end);
  const type = String(req.body?.type || 'Obitelj');

  if (error) {
    return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
  }
  if (![4, 5, 6].includes(digits)) {
    return res.status(400).json({ ok: false, code: 'INVALID_DIGITS', message: 'digits must be 4, 5, or 6.' });
  }
  if (!PIN_TYPES.has(type)) {
    return res.status(400).json({ ok: false, code: 'INVALID_PIN_TYPE', message: 'Invalid PIN type.' });
  }

  const count = countActiveOrFuturePins();
  if (count >= MAX_ACTIVE_OR_FUTURE_PINS) {
    return res.status(400).json({ ok: false, code: 'MAX_PINS_REACHED', message: 'Maximum 4 active/future PINs reached.' });
  }

  const maxRetries = 30;
  let pin = null;
  for (let i = 0; i < maxRetries; i += 1) {
    const candidate = generatePinCode(digits);
    if (!getPin(candidate)) {
      pin = candidate;
      break;
    }
  }

  if (!pin) {
    return res.status(500).json({ ok: false, code: 'PIN_GENERATION_FAILED', message: 'Unable to generate unique PIN.' });
  }

  const created = createPin({ pin, start, end, type });
  return res.json({ ok: true, pin: created });
});

app.get('/api/admin/pins', requireAdmin, (_req, res) => {
  const now = Date.now();
  const rows = listPins(now).map((row) => normalizePinRow(row, now));
  return res.json({ ok: true, pins: rows });
});

app.delete('/api/admin/pins/:pin', requireAdmin, (req, res) => {
  const changes = deletePin(req.params.pin);
  if (!changes) {
    return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'PIN not found.' });
  }
  return res.json({ ok: true });
});

const gateRateLimit = createIpRateLimiter({ limit: 8, windowMs: 60_000 });

app.post('/api/gate/open', gateRateLimit, async (req, res) => {
  const pin = String(req.body?.pin || '').trim();

  if (!pin) {
    return res.status(400).json({ ok: false, code: 'PIN_MISSING', message: 'PIN is required.' });
  }

  const now = Date.now();
  const row = getPin(pin);

  if (!row) {
    cleanupExpiredPins(now);
    return res.status(401).json({ ok: false, code: 'PIN_INVALID', message: 'Wrong PIN.' });
  }

  if (row.end <= now) {
    cleanupExpiredPins(now);
    return res.status(403).json({ ok: false, code: 'PIN_EXPIRED', message: 'PIN has expired.' });
  }

  if (row.start > now) {
    return res.status(403).json({
      ok: false,
      code: 'PIN_NOT_ACTIVE_YET',
      message: 'PIN not active yet.',
      left: getTimeLeftParts(row.start, now),
      pin_type: row.type,
    });
  }

  try {
    const shelly = await openGateWithShelly();
    return res.json({ ok: true, shelly, pin_type: row.type, left: getTimeLeftParts(row.end, now) });
  } catch (error) {
    console.error('Shelly call failed:', error.message);
    return res.status(502).json({ ok: false, code: 'OFFLINE_OR_UPSTREAM', message: 'Gate controller unavailable.' });
  }
});

app.listen(port, () => {
  console.log(`Guest Portal running on port ${port}`);
});
