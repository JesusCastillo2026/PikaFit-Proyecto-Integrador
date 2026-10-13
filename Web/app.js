const $ = id => document.getElementById(id);
const roleLabels = {
  SOCIO: 'Socio', ADMIN: 'Administrador', ADMIN_B2B: 'Administrador B2B',
  MEDICO: 'Médico', COACH: 'Coach', RECEPCION_CLINICA: 'Recepción clínica',
  ADMIN_CLINICA: 'Administrador clínica', AUDITOR: 'Auditor',
};
let token = sessionStorage.getItem('pikafit_token');
let currentUser = null;
let cameraStream = null;
let scanning = false;

function message(id, value, error = false) {
  const target = $(id);
  target.textContent = value;
  target.classList.toggle('error', error);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  let result;
  try { result = await response.json(); } catch { result = {}; }
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud');
  return result;
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

function renderUser(user) {
  currentUser = user;
  $('login-panel').hidden = Boolean(user);
  $('dashboard').hidden = !user;
  $('session-actions').hidden = !user;
  if (!user) return;
  $('session-name').textContent = user.name;
  $('dashboard-title').textContent = `Hola, ${user.name.split(' ')[0]}`;
  $('dashboard-subtitle').textContent = 'Tu espacio de trabajo de PikaFit';
  $('role-pill').textContent = roleLabels[user.role] || user.role;
  $('member-panel').hidden = user.role !== 'SOCIO';
  $('admin-panel').hidden = user.role !== 'ADMIN';
  $('audit-panel').hidden = !['ADMIN', 'AUDITOR'].includes(user.role);
  $('reception-panel').hidden = user.role !== 'RECEPCION_CLINICA';
  $('clinic-admin-panel').hidden = user.role !== 'ADMIN_CLINICA';
  if (user.role === 'SOCIO') {
    const active = user.membershipActive;
    $('membership-message').textContent = active
      ? `Membresía vigente hasta ${new Date(user.membershipExpiresAt).toLocaleDateString('es-PE')}.`
      : 'Tu membresía está vencida. Renueva tu plan para generar pases y acceder al servicio.';
    $('create-pass').disabled = !active;
  }
}

async function refreshDashboard() {
  if (!token) return renderUser(null);
  try {
    const { user } = await api('/api/me');
    renderUser(user);
    if (user.role === 'ADMIN') await loadUsers();
    if (['ADMIN', 'AUDITOR'].includes(user.role)) await loadAudit();
    if (user.role === 'ADMIN_CLINICA') await loadHistory();
  } catch {
    token = null;
    sessionStorage.removeItem('pikafit_token');
    renderUser(null);
  }
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const identifier = String(fields.get('identifier') || '').trim();
  const payload = /^\d{8}$/.test(identifier)
    ? { dni: identifier, password: fields.get('password') }
    : { email: identifier, password: fields.get('password') };
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    token = result.token;
    sessionStorage.setItem('pikafit_token', token);
    form.reset();
    message('login-message', '');
    await refreshDashboard();
  } catch (error) { message('login-message', error.message, true); }
});

$('logout').addEventListener('click', () => {
  stopCamera();
  token = null;
  sessionStorage.removeItem('pikafit_token');
  $('pass-result').hidden = true;
  renderUser(null);
});

$('create-pass').addEventListener('click', async () => {
  try {
    const { pass } = await api('/api/medical-passes', { method: 'POST', body: '{}' });
    $('pass-qr').src = pass.qrDataUrl;
    $('pass-code').textContent = pass.code;
    $('pass-expiry').textContent = `Válido hasta ${new Date(pass.expiresAt).toLocaleTimeString('es-PE')}`;
    $('pass-result').hidden = false;
    message('dashboard-message', 'Pase generado correctamente.');
  } catch (error) { message('dashboard-message', error.message, true); }
});

async function loadUsers() {
  const [users, roles] = await Promise.all([api('/api/users'), api('/api/roles')]);
  const roleSelect = $('new-user-role');
  roleSelect.replaceChildren(...roles.roles.map(role => { const option = element('option', '', roleLabels[role]); option.value = role; return option; }));
  const container = $('users-list');
  container.replaceChildren();
  for (const user of users.items) {
    const item = element('div', 'list-item');
    const info = element('div');
    info.append(element('strong', '', user.name), element('small', '', user.email));
    const select = element('select');
    select.setAttribute('aria-label', `Rol de ${user.name}`);
    for (const role of roles.roles) {
      const option = element('option', '', roleLabels[role]);
      option.value = role;
      option.selected = role === user.role;
      select.append(option);
    }
    select.disabled = user.id === currentUser.id;
    select.addEventListener('change', async () => {
      try {
        await api(`/api/users/${user.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: select.value }) });
        message('dashboard-message', `Rol de ${user.name} actualizado.`);
        await loadAudit();
      } catch (error) { select.value = user.role; message('dashboard-message', error.message, true); }
    });
    item.append(info, select);
    container.append(item);
  }
}

$('create-user-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  for (const key of ['dni', 'clinicId', 'membershipExpiresAt']) if (!data[key]) delete data[key];
  try {
    const { user } = await api('/api/users', { method: 'POST', body: JSON.stringify(data) });
    message('create-user-message', `Cuenta de ${user.name} creada.`);
    form.reset();
    await loadUsers();
  } catch (error) { message('create-user-message', error.message, true); }
});

async function loadAudit() {
  const { items } = await api('/api/audit/roles');
  const container = $('audit-list');
  container.replaceChildren();
  if (!items.length) return container.append(element('p', 'muted', 'Aún no hay cambios de roles.'));
  for (const item of items) {
    const row = element('div', 'list-item');
    row.append(element('div', '', `${roleLabels[item.previousRole]} → ${roleLabels[item.newRole]}`), element('small', '', new Date(item.createdAt).toLocaleString('es-PE')));
    container.append(row);
  }
}

$('validate-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const value = String(new FormData(form).get('value') || '').trim();
  const payload = value.length === 6 ? { code: value } : { token: value };
  try {
    await api('/api/clinic/passes/validate', { method: 'POST', body: JSON.stringify(payload) });
    message('validation-message', 'Pase válido: socio apto para atención.');
    form.reset();
  } catch (error) { message('validation-message', error.message, true); }
});

async function scanLoop() {
  if (!scanning) return;
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const found = await detector.detect($('camera'));
    if (found.length) {
      $('validate-form').querySelector('[name="value"]').value = found[0].rawValue;
      message('camera-message', 'QR leído. Pulsa Validar para confirmar el pase.');
      stopCamera();
      return;
    }
  } catch (error) { message('camera-message', error.message, true); stopCamera(); return; }
  if (scanning) setTimeout(scanLoop, 400);
}

function stopCamera() {
  scanning = false;
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  $('camera').srcObject = null;
  $('camera').hidden = true;
  $('stop-camera').hidden = true;
}

$('start-camera').addEventListener('click', async () => {
  if (!('BarcodeDetector' in window)) return message('camera-message', 'Este navegador no admite lectura QR; ingresa el código manualmente.', true);
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    $('camera').srcObject = cameraStream;
    $('camera').hidden = false;
    $('stop-camera').hidden = false;
    scanning = true;
    scanLoop();
  } catch (error) { message('camera-message', 'No se pudo abrir la cámara.', true); }
});
$('stop-camera').addEventListener('click', stopCamera);

async function loadHistory() {
  const params = new URLSearchParams();
  if ($('history-from').value) params.set('from', `${$('history-from').value}T00:00:00-05:00`);
  if ($('history-to').value) params.set('to', `${$('history-to').value}T23:59:59-05:00`);
  const { items } = await api(`/api/clinic/passes/history?${params}`);
  const container = $('history-list');
  container.replaceChildren();
  if (!items.length) return container.append(element('p', 'muted', 'No hay pases validados en este período.'));
  for (const item of items) {
    const row = element('div', 'list-item');
    const info = element('div');
    info.append(element('strong', '', item.memberName), element('small', '', item.memberDni || item.memberId));
    row.append(info, element('small', '', new Date(item.validatedAt).toLocaleString('es-PE')));
    container.append(row);
  }
}
$('load-history').addEventListener('click', () => loadHistory().catch(error => message('dashboard-message', error.message, true)));

refreshDashboard();
