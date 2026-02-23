const pinInput = document.getElementById('pin');
const openBtn = document.getElementById('openBtn');
const msg = document.getElementById('msg');
const gateIcon = document.getElementById('gateIcon');
const validityBadge = document.getElementById('validityBadge');
const tabsContainer = document.getElementById('tabs');
const langSelect = document.getElementById('langSelect');
const openTabTitle = document.getElementById('openTabTitle');

const i18n = {
  hr: { tabs: ['Dobrodošli', 'Pravila', 'Preporuke', 'Informacije', 'Otvori portun'], gateBtn: 'Otvori portun', loading: 'Otvaranje...', ok: 'Portun otvoren!', offline: 'Nema internetske veze.' },
  en: { tabs: ['Welcome', 'Rules', 'Recommendations', 'Information', 'Open Gate'], gateBtn: 'Open Gate', loading: 'Opening gate...', ok: 'Gate opened!', offline: 'No internet connection.' },
  de: { tabs: ['Willkommen', 'Regeln', 'Empfehlungen', 'Informationen', 'Open Gate'], gateBtn: 'Open Gate', loading: 'Öffne Tor...', ok: 'Tor geöffnet!', offline: 'Keine Internetverbindung.' },
  it: { tabs: ['Benvenuti', 'Regole', 'Consigli', 'Informazioni', 'Open Gate'], gateBtn: 'Open Gate', loading: 'Apertura cancello...', ok: 'Cancello aperto!', offline: 'Nessuna connessione internet.' },
  cs: { tabs: ['Vítejte', 'Pravidla', 'Doporučení', 'Informace', 'Open Gate'], gateBtn: 'Open Gate', loading: 'Otevírání brány...', ok: 'Brána otevřena!', offline: 'Bez internetu.' },
  pl: { tabs: ['Witamy', 'Zasady', 'Rekomendacje', 'Informacje', 'Open Gate'], gateBtn: 'Open Gate', loading: 'Otwieranie bramy...', ok: 'Brama otwarta!', offline: 'Brak połączenia internetowego.' },
  hu: { tabs: ['Üdvözöljük', 'Szabályok', 'Ajánlások', 'Információk', 'Open Gate'], gateBtn: 'Open Gate', loading: 'Kapunyitás...', ok: 'Kapunyitás sikeres!', offline: 'Nincs internetkapcsolat.' },
};

const tabDefs = [
  { id: 'welcome', panel: 'tab-welcome' },
  { id: 'rules', panel: 'tab-rules' },
  { id: 'reco', panel: 'tab-reco' },
  { id: 'info', panel: 'tab-info' },
  { id: 'gate', panel: 'tab-gate' },
];

let currentLang = 'hr';

function renderTabs() {
  tabsContainer.innerHTML = '';
  tabDefs.forEach((tab, idx) => {
    const btn = document.createElement('button');
    btn.className = `tab-btn ${idx === 0 ? 'active' : ''}`;
    btn.textContent = i18n[currentLang].tabs[idx];
    btn.addEventListener('click', () => activateTab(tab.panel, btn));
    tabsContainer.appendChild(btn);
  });

  const buttonLabel = openBtn.querySelector('span[data-i18n="gate.button"]');
  buttonLabel.textContent = i18n[currentLang].gateBtn;
  openTabTitle.textContent = i18n[currentLang].tabs[4];
}

function activateTab(panelId, buttonEl) {
  document.querySelectorAll('.tab-content').forEach((panel) => panel.classList.add('hidden'));
  document.getElementById(panelId).classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
  buttonEl.classList.add('active');
}

function totalHours(left) {
  return (left.days * 24) + left.hours + (left.minutes / 60);
}

function renderValidity(left) {
  const hours = totalHours(left);
  validityBadge.className = 'validity';
  if (hours > 24 * 5) {
    validityBadge.classList.add('green');
  } else if (hours >= 48) {
    validityBadge.classList.add('orange');
  } else {
    validityBadge.classList.add('red');
  }
  validityBadge.classList.remove('hidden');
  validityBadge.textContent = `PIN vrijedi još ${left.days}d ${left.hours}h ${left.minutes}min`;
}

pinInput.addEventListener('input', () => {
  openBtn.disabled = pinInput.value.trim().length < 4;
});

openBtn.addEventListener('click', async () => {
  msg.textContent = i18n[currentLang].loading;
  validityBadge.classList.add('hidden');
  gateIcon.classList.remove('opening');

  try {
    const res = await fetch('/api/gate/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinInput.value.trim() }),
    });
    const data = await res.json();

    if (data.ok) {
      msg.textContent = i18n[currentLang].ok;
      gateIcon.classList.add('opening');
      if (data.left) renderValidity(data.left);
      return;
    }

    if (data.code === 'PIN_NOT_ACTIVE_YET' && data.left) {
      msg.textContent = `PIN će biti aktivan za ${data.left.days}d ${data.left.hours}h ${data.left.minutes}min`;
      renderValidity(data.left);
      return;
    }

    msg.textContent = data.code || 'Greška';
    navigator.vibrate?.(220);
  } catch (_err) {
    msg.textContent = i18n[currentLang].offline;
  }
});

langSelect.addEventListener('change', () => {
  currentLang = langSelect.value;
  renderTabs();
});

renderTabs();
