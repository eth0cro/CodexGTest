const SHELLY_BASE_URL = process.env.SHELLY_BASE_URL || 'https://shelly-193-eu.shelly.cloud';

async function openGateWithShelly() {
  const id = process.env.SHELLY_DEVICE_ID;
  const authKey = process.env.SHELLY_AUTH_KEY;

  if (!id || !authKey) {
    throw new Error('Shelly credentials are not configured.');
  }

  const body = new URLSearchParams({
    id,
    auth_key: authKey,
    channel: '0',
    turn: 'on',
  });

  const response = await fetch(`${SHELLY_BASE_URL}/device/relay/control/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shelly upstream failed: ${response.status} ${text.slice(0, 300)}`);
  }

  return response.json();
}

module.exports = { openGateWithShelly };
