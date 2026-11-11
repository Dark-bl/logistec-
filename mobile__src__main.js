import { createClient } from '@supabase/supabase-js';
import { registerPlugin, Capacitor } from '@capacitor/core';
// Configuración pública de Supabase. La seguridad real se aplica mediante Auth, RLS y Edge Functions.
const SUPABASE_URL = 'https://ugrfilgclbmejgdldood.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_SpjmDo69S3iPQjVJnkIl7Q_-apIXCgG';


const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 5 } },
});
const LogistecGps = registerPlugin('LogistecGps');
const PENDING_KEY = 'logistec_mobile_gps_pending_v1';
const FINISH_KEY = 'logistec_mobile_finish_pending_v1';
const PAUSE_KEY = 'logistec_mobile_pause_pending_v1';
const ACTIVE_KEY = 'logistec_mobile_session_v1';
function userStorageKey(base) { return `${base}_${state.user?.id || 'unbound'}`; }

const $ = (id) => document.getElementById(id);
const state = {
  user: null, member: null, organization: null, driver: null,
  vehicles: [], deliveries: [], session: null, watchId: null,
  lastPoint: null, lastTransmitAt: 0, lastMovement: false, finishPending: false,
  map: null, marker: null, nativeTracking: false, nativeStatusTimer: null,
};

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3000);
}
function setMessage(id, message) { $(id).textContent = message || ''; }
function setConnection() {
  const online = navigator.onLine;
  $('connection-pill').textContent = online ? 'En línea' : 'Sin conexión';
  $('connection-pill').classList.toggle('online', online);
  $('sync-status').textContent = online ? 'Conexión disponible. Las posiciones pendientes se sincronizarán.' : 'Sin conexión. Las posiciones capturadas se conservarán en cola local.';
}
function setScreen(authenticated) {
  $('login-screen').hidden = authenticated;
  $('app-screen').hidden = !authenticated;
  if (!authenticated && state.nativeStatusTimer) {
    clearInterval(state.nativeStatusTimer);
    state.nativeStatusTimer = null;
  }
  if (authenticated && Capacitor.isNativePlatform() && !state.nativeStatusTimer) {
    state.nativeStatusTimer = setInterval(async () => {
      if (document.hidden || !state.session || state.session.status !== 'active') return;
      try {
        const status = await LogistecGps.status();
        $('diagnostic-permission').textContent = status?.locationPermission || 'No disponible';
        $('diagnostic-location').textContent = status?.locationEnabled ? 'Activado' : 'Desactivado';
        $('diagnostic-service').textContent = status?.paused ? 'En pausa' : status?.active ? 'Activo' : 'Detenido';
        $('diagnostic-notifications').textContent = status?.notificationsPermission || 'No disponible';
        $('diagnostic-text').textContent = `Android · ${status?.queuedCount || 0} posición(es) pendientes.`;
        $('settings-connection').textContent = navigator.onLine ? 'Conexión disponible.' : 'Sin conexión.';
        if (status?.lastPosition) updatePositionUI(status.lastPosition, status.lastPosition.capturedAt);
        if (status?.queuedCount) setMessage('sync-status', `${status.queuedCount} posición(es) pendientes de sincronización.`);
      } catch (error) { console.warn('Estado GPS nativo:', error); }
    }, 15000);
  }
}
function formatTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
function newUuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}
function pendingRead() {
  try { return JSON.parse(localStorage.getItem(userStorageKey(PENDING_KEY)) || '[]'); } catch { return []; }
}
function pendingWrite(items) {
  localStorage.setItem(userStorageKey(PENDING_KEY), JSON.stringify(items.slice(-2500)));
}
function finishQueueRead() {
  try { return JSON.parse(localStorage.getItem(userStorageKey(FINISH_KEY)) || '[]'); } catch { return []; }
}
function finishQueueWrite(items) { localStorage.setItem(userStorageKey(FINISH_KEY), JSON.stringify([...new Set(items)])); }
function pauseQueueRead() {
  try { return JSON.parse(localStorage.getItem(userStorageKey(PAUSE_KEY)) || '[]'); } catch { return []; }
}
function pauseQueueWrite(items) { localStorage.setItem(userStorageKey(PAUSE_KEY), JSON.stringify([...new Set(items)])); }

function isRetryableGpsError(error) {
  const status = Number(error?.context?.status || error?.status || 0);
  return !status || status === 401 || status === 408 || status === 429 || status >= 500;
}

async function sendPosition(position) {
  if (!state.session?.id) throw new Error('No hay una jornada GPS activa.');
  const payload = {
    sessionId: state.session.id,
    clientPositionId: position.clientPositionId || newUuid(),
    latitude: Number(position.latitude), longitude: Number(position.longitude),
    accuracy: Number(position.accuracy),
    speed: position.speed == null ? null : Number(position.speed),
    heading: position.heading == null ? null : Number(position.heading),
    capturedAt: position.capturedAt || new Date().toISOString(),
  };
  if (!navigator.onLine) {
    const queue = pendingRead();
    queue.push(payload);
    pendingWrite(queue);
    setMessage('sync-status', `Sin conexión. ${queue.length} posición(es) pendientes de sincronizar.`);
    return { queued: true };
  }
  const { data, error } = await supabase.functions.invoke('logistec-gps-ingest', { body: payload });
  if (error) {
    if (isRetryableGpsError(error)) {
      const queue = pendingRead();
      queue.push(payload);
      pendingWrite(queue);
      throw new Error(error.message || 'No se pudo enviar la posición; quedó en cola local.');
    }
    throw new Error(`Supabase rechazó la posición (${error.context?.status || error.status || '4xx'}); no se guardó para reenvío.`);
  }
  setMessage('sync-status', `Posición aceptada por Supabase · ${formatTime(payload.capturedAt)}`);
  return data;
}

async function flushBrowserQueue() {
  if (!navigator.onLine || !state.user) return;
  const blockedSessions = new Set([...pauseQueueRead(), ...finishQueueRead()]);
  const queue = pendingRead().filter(item => !blockedSessions.has(item.sessionId)).sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  if (!queue.length) return;
  const remaining = [];
  for (const item of queue) {
    const { error } = await supabase.functions.invoke('logistec-gps-ingest', { body: item });
    if (error && isRetryableGpsError(error)) remaining.push(item);
  }
  pendingWrite(remaining);
  setMessage('sync-status', remaining.length ? `${remaining.length} posición(es) siguen pendientes.` : 'Cola de ubicaciones sincronizada.');
}

async function attemptPendingPauses() {
  if (!navigator.onLine || !state.user) return;
  const ids = pauseQueueRead();
  const remaining = [];
  for (const id of ids) {
    const { error } = await supabase.rpc('pause_gps_session', { p_session_id: id });
    if (error && !String(error.message || '').includes('La jornada no está activa')) remaining.push(id);
    else if (Capacitor.isNativePlatform()) {
      try {
        const nativeStatus = await LogistecGps.status();
        if (nativeStatus?.sessionId === id) await LogistecGps.confirmPause({ sessionId: id });
      } catch (confirmError) {
        remaining.push(id);
        console.warn('La pausa ya está en Supabase, pero la cola nativa sigue retenida:', confirmError);
      }
    }
  }
  pauseQueueWrite(remaining);
}

async function attemptPendingFinishes() {
  if (!navigator.onLine || !state.user) return;
  const ids = finishQueueRead();
  const remaining = [];
  for (const id of ids) {
    const { error } = await supabase.rpc('finish_gps_session', { p_session_id: id });
    if (error) remaining.push(id);
    else pauseQueueWrite(pauseQueueRead().filter(pauseId => pauseId !== id));
  }
  finishQueueWrite(remaining);
  if (!remaining.length) {
    state.finishPending = false;
    renderShift();
  }
}

async function flushNativeQueue() {
  if (!Capacitor.isNativePlatform()) return;
  // No liberar la cola nativa mientras una pausa/cierre local siga pendiente.
  if (pauseQueueRead().length || finishQueueRead().length) return;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) return;
  await LogistecGps.flushPending({
    supabaseUrl: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    userId: state.user?.id || '',
    edgeFunctionUrl: `${SUPABASE_URL}/functions/v1/logistec-gps-ingest`,
  });
}

async function refreshContext() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Inicia sesión con una cuenta de conductor.');
  state.user = userData.user;

  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .select('organization_id,full_name,role')
    .eq('user_id', state.user.id)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member || member.role !== 'driver') {
    throw new Error('Esta aplicación está reservada a cuentas con rol conductor. Tu cuenta no tiene ese permiso.');
  }
  state.member = member;
  await attemptPendingPauses();
  await attemptPendingFinishes();

  const [driverResult, orgResult] = await Promise.all([
    supabase.from('drivers').select('id,name,phone,status,user_id').eq('organization_id', member.organization_id).eq('user_id', state.user.id).maybeSingle(),
    supabase.from('organizations').select('id,name').eq('id', member.organization_id).single(),
  ]);
  if (driverResult.error) throw driverResult.error;
  if (orgResult.error) throw orgResult.error;
  if (!driverResult.data) throw new Error('Tu usuario aún no está vinculado a un registro de conductor. Pide al administrador que vincule tu cuenta.');
  state.driver = driverResult.data;
  state.organization = orgResult.data;

  const [vehiclesResult, deliveriesResult, sessionResult] = await Promise.all([
    supabase.from('vehicles').select('id,plate,vehicle_type,status,driver_id').eq('organization_id', member.organization_id).eq('driver_id', state.driver.id),
    supabase.from('deliveries').select('id,recipient,address,status,priority,vehicle_id,driver_id,created_at').eq('organization_id', member.organization_id).eq('driver_id', state.driver.id).order('created_at', { ascending: false }),
    supabase.from('gps_sessions').select('id,vehicle_id,status,started_at,state_changed_at,ended_at').eq('organization_id', member.organization_id).eq('driver_user_id', state.user.id).in('status', ['active', 'paused']).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const result of [vehiclesResult, deliveriesResult, sessionResult]) if (result.error) throw result.error;
  state.vehicles = vehiclesResult.data || [];
  state.deliveries = deliveriesResult.data || [];
  state.session = sessionResult.data || null;
  state.finishPending = Boolean(state.session && finishQueueRead().includes(state.session.id));
  if (state.finishPending) {
    state.session = null;
    setMessage('sync-status', 'La jornada anterior ya detuvo el GPS en este dispositivo. Su cierre espera conexión con Supabase.');
  }
  if (state.session && pauseQueueRead().includes(state.session.id) && state.session.status === 'active') {
    state.session.status = 'paused';
    state.session.localPausePending = true;
  }

  $('welcome-name').textContent = `Hola, ${state.driver.name || member.full_name || 'conductor'}`;
  $('welcome-company').textContent = state.organization.name;
  $('profile-name').textContent = state.driver.name || member.full_name || '—';
  $('profile-email').textContent = state.user.email || '—';
  $('profile-company').textContent = state.organization.name;
  $('profile-role').textContent = 'Conductor';
  $('profile-status').textContent = state.driver.status || 'Activo';

  const selector = $('vehicle-select');
  selector.innerHTML = state.vehicles.length
    ? state.vehicles.map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.plate)} · ${escapeHtml(v.vehicle_type || 'Vehículo')}</option>`).join('')
    : '<option value="">No tienes un vehículo asignado</option>';
  if (state.session?.vehicle_id) selector.value = state.session.vehicle_id;
  selector.disabled = Boolean(state.session) || !state.vehicles.length;
  renderDeliveries();
  renderShift();
  setScreen(true);
  $('diagnostic-text').textContent = `Permisos GPS nativos: ${Capacitor.isNativePlatform() ? (state.nativeTracking ? 'servicio nativo en ejecución' : 'se solicitarán al iniciar o reanudar la jornada') : 'la vista web solo permite GPS en primer plano'}.`;
  if (Capacitor.isNativePlatform()) {
    try {
      const nativeStatus = await LogistecGps.status();
      state.nativeTracking = Boolean(nativeStatus?.active && !nativeStatus?.paused);
      $('diagnostic-permission').textContent = nativeStatus?.locationPermission || 'No disponible';
      $('diagnostic-location').textContent = nativeStatus?.locationEnabled ? 'Activado' : 'Desactivado';
      $('diagnostic-service').textContent = nativeStatus?.paused ? 'En pausa' : nativeStatus?.active ? 'Activo' : 'Detenido';
      $('diagnostic-notifications').textContent = nativeStatus?.notificationsPermission || 'No disponible';
      $('diagnostic-text').textContent = `Android · ${nativeStatus?.queuedCount || 0} posición(es) pendientes. La ubicación solo se consulta durante una jornada activa.`;
      $('settings-connection').textContent = navigator.onLine ? 'Conexión disponible.' : 'Sin conexión. Los datos pendientes esperan sincronización.';
      if (nativeStatus?.lastPosition) updatePositionUI(nativeStatus.lastPosition, nativeStatus.lastPosition.capturedAt);
      if (nativeStatus?.queuedCount) setMessage('sync-status', `${nativeStatus.queuedCount} posición(es) pendientes de sincronización.`);
      await flushNativeQueue();
      renderShift();
    } catch (error) { console.warn('No se pudo recuperar el estado GPS nativo:', error); }
  }
  await flushBrowserQueue();
}

function renderDeliveries() {
  const active = state.deliveries.filter((d) => d.status !== 'Entregada');
  const done = state.deliveries.filter((d) => d.status === 'Entregada');
  $('home-active-deliveries').textContent = active.length;
  $('home-done-deliveries').textContent = done.length;
  const html = (items) => items.length ? items.map((d) => `
    <article class="delivery-card"><div><b>${escapeHtml(d.recipient || d.id)}</b><p>${escapeHtml(d.address || 'Sin dirección')}<br>${escapeHtml(d.id)}</p></div><span class="delivery-state">${escapeHtml(d.status)}</span></article>
  `).join('') : '<div class="fine-print">No hay entregas asignadas.</div>';
  $('home-deliveries').innerHTML = html(active.slice(0, 3));
  $('deliveries-list').innerHTML = html(state.deliveries);
}

function renderShift() {
  const session = state.session;
  const vehicle = state.vehicles.find((v) => v.id === (session?.vehicle_id || $('vehicle-select').value));
  const trackingActive = Boolean(session?.status === 'active' && (Capacitor.isNativePlatform() ? state.nativeTracking : state.watchId !== null));
  $('home-vehicle').textContent = vehicle ? vehicle.plate : 'Sin asignar';
  $('shift-status').textContent = state.finishPending ? 'Cierre pendiente de sincronización' : !session ? 'Sin iniciar' : session.status === 'paused' ? 'Jornada pausada' : trackingActive ? 'Jornada activa' : 'Jornada activa · GPS desconectado';
  $('home-gps-status').textContent = state.finishPending ? 'GPS detenido · cierre pendiente' : !session ? 'Apagado' : session.status === 'paused' ? 'Pausado' : trackingActive ? 'Compartiendo ubicación' : 'GPS detenido · restablecer';
  $('gps-dot').classList.toggle('active', trackingActive);
  $('start-shift').hidden = Boolean(session);
  $('start-shift').disabled = Boolean(state.finishPending) || !state.vehicles.length;
  $('pause-shift').hidden = !session || session.status !== 'active' || !trackingActive;
  $('resume-shift').hidden = !session || session.status !== 'paused';
  $('recover-gps').hidden = !session || session.status !== 'active' || trackingActive;
  $('finish-shift').hidden = !session;
  $('tracking-state-pill').textContent = !session ? 'Sin iniciar' : session.status === 'paused' ? 'Pausado' : trackingActive ? 'GPS activo' : 'GPS por reconectar';
  $('vehicle-select').disabled = Boolean(session) || !state.vehicles.length;
}

function updatePositionUI(coords, capturedAt) {
  $('position-lat').textContent = Number(coords.latitude).toFixed(6);
  $('position-lng').textContent = Number(coords.longitude).toFixed(6);
  $('position-accuracy').textContent = Number.isFinite(coords.accuracy) ? `±${Math.round(coords.accuracy)} m` : '—';
  $('position-time').textContent = formatTime(capturedAt);
  $('position-speed').textContent = Number.isFinite(coords.speed) && coords.speed >= 0 ? `${(coords.speed * 3.6).toFixed(1)} km/h` : 'No disponible';
  $('position-heading').textContent = Number.isFinite(coords.heading) && coords.heading >= 0 ? `${Math.round(coords.heading)}°` : 'No disponible';
  if (window.L && $('mobile-map')) {
    const point = [coords.latitude, coords.longitude];
    if (!state.map) {
      state.map = L.map('mobile-map', { zoomControl: true }).setView(point, 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(state.map);
    }
    if (state.marker) state.marker.setLatLng(point);
    else state.marker = L.marker(point).addTo(state.map).bindPopup('Tu ubicación autorizada');
    state.map.setView(point, 16);
    setTimeout(() => state.map.invalidateSize(), 80);
  }
}

async function onBrowserPosition(position) {
  const c = position.coords;
  const capturedAt = new Date(position.timestamp || Date.now()).toISOString();
  updatePositionUI(c, capturedAt);
  const moving = Number.isFinite(c.speed) && c.speed > 1.2;
  const interval = moving ? 12000 : 60000;
  if (Date.now() - state.lastTransmitAt < interval) return;
  const point = {
    latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy,
    speed: c.speed, heading: c.heading, capturedAt,
  };
  try {
    await sendPosition(point);
    state.lastTransmitAt = Date.now();
  } catch (error) {
    setMessage('sync-status', `${error.message} Se reintentará cuando vuelva la conexión.`);
  }
}

function startBrowserTracking() {
  if (!navigator.geolocation) throw new Error('Este dispositivo no dispone de geolocalización.');
  state.watchId = navigator.geolocation.watchPosition(onBrowserPosition, (error) => {
    const message = error.code === 1 ? 'Permiso de ubicación denegado.' : error.code === 2 ? 'No se pudo determinar la ubicación.' : 'La lectura de GPS agotó el tiempo.';
    toast(message);
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 25000 });
}

async function startShift() {
  if (state.finishPending) return toast('Conéctate para confirmar el cierre de la jornada anterior antes de iniciar otra.');
  const vehicleId = $('vehicle-select').value;
  if (!vehicleId) return toast('No tienes un vehículo autorizado asignado.');
  $('start-shift').disabled = true;
  try {
    const { data: sessionId, error } = await supabase.rpc('start_gps_session', {
      p_vehicle_id: vehicleId,
      p_device_label: Capacitor.isNativePlatform() ? 'Android · LOGISTEC Mobile' : 'Web · LOGISTEC Mobile preview',
    });
    if (error) throw error;
    state.session = { id: sessionId, vehicle_id: vehicleId, status: 'active', started_at: new Date().toISOString() };
    localStorage.setItem(userStorageKey(ACTIVE_KEY), sessionId);
    if (Capacitor.isNativePlatform()) {
      const auth = await supabase.auth.getSession();
      const currentSession = auth.data.session;
      if (!currentSession) throw new Error('La sesión de Supabase expiró. Vuelve a iniciar sesión.');
      await LogistecGps.start({
        sessionId,
        supabaseUrl: SUPABASE_URL,
        publishableKey: SUPABASE_PUBLISHABLE_KEY,
        accessToken: currentSession.access_token,
        refreshToken: currentSession.refresh_token,
        userId: state.user.id,
        edgeFunctionUrl: `${SUPABASE_URL}/functions/v1/logistec-gps-ingest`,
      });
      state.nativeTracking = true;
      setMessage('sync-status', 'Servicio GPS nativo activo. La notificación de Android confirma que la jornada comparte ubicación.');
    } else {
      startBrowserTracking();
      setMessage('sync-status', 'Vista previa web: GPS en primer plano solamente. La app Android nativa es necesaria para segundo plano.');
    }
    renderShift();
    toast('Jornada iniciada. LOGISTEC está compartiendo tu ubicación.');
  } catch (error) {
    // Un fallo al abrir la pantalla/servicio no debe dejar captura nativa activa.
    if (Capacitor.isNativePlatform()) {
      try { await LogistecGps.stop(); } catch (stopError) { console.warn('No se pudo detener el servicio tras un inicio fallido:', stopError); }
      state.nativeTracking = false;
    }
    if (state.session?.id) {
      try {
        const { error: finishError } = await supabase.rpc('finish_gps_session', { p_session_id: state.session.id });
        if (finishError) { const queued = finishQueueRead(); queued.push(state.session.id); finishQueueWrite(queued); }
      } catch { const queued = finishQueueRead(); queued.push(state.session.id); finishQueueWrite(queued); }
    }
    state.session = null;
    toast(error.message || 'No se pudo iniciar la jornada.');
  } finally {
    $('start-shift').disabled = false;
  }
}

async function recoverGps() {
  if (!state.session?.id || state.session.status !== 'active') return;
  try {
    if (Capacitor.isNativePlatform()) {
      const auth = await supabase.auth.getSession();
      const currentSession = auth.data.session;
      if (!currentSession) throw new Error('La sesión de Supabase expiró. Inicia sesión de nuevo.');
      await LogistecGps.start({
        sessionId: state.session.id, supabaseUrl: SUPABASE_URL,
        publishableKey: SUPABASE_PUBLISHABLE_KEY,
        accessToken: currentSession.access_token, refreshToken: currentSession.refresh_token,
        userId: state.user.id,
        edgeFunctionUrl: `${SUPABASE_URL}/functions/v1/logistec-gps-ingest`,
      });
      state.nativeTracking = true;
    } else {
      startBrowserTracking();
    }
    renderShift();
    toast('Conexión GPS restablecida para la jornada activa.');
  } catch (error) { toast(error.message || 'No se pudo restablecer el GPS.'); }
}

async function pauseShift() {
  if (!state.session?.id) return;
  const sessionId = state.session.id;
  try {
    // Privacidad primero: detener la captura local antes de depender de la red.
    if (Capacitor.isNativePlatform()) await LogistecGps.pause();
    if (state.watchId !== null) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
    state.nativeTracking = false;
    state.session.status = 'paused';
    renderShift();
    const { error } = await supabase.rpc('pause_gps_session', { p_session_id: sessionId });
    if (error) {
      pauseQueueWrite([...pauseQueueRead(), sessionId]);
      state.session.localPausePending = true;
      setMessage('sync-status', 'GPS detenido en este dispositivo. La pausa se confirmará en Supabase cuando vuelva la conexión.');
      toast('Seguimiento detenido localmente. Confirmación de pausa pendiente de conexión.');
      return;
    }
    if (Capacitor.isNativePlatform()) {
      try { await LogistecGps.confirmPause({ sessionId }); }
      catch (confirmError) {
        pauseQueueWrite([...pauseQueueRead(), sessionId]);
        state.session.localPausePending = true;
        throw confirmError;
      }
    }
    pauseQueueWrite(pauseQueueRead().filter(id => id !== sessionId));
    state.session.localPausePending = false;
    toast('Seguimiento pausado. No se están capturando ubicaciones.');
  } catch (error) {
    // Si el plugin no pudo pausar, libera el bloqueo de cola y conserva el
    // estado activo; no se afirma que la captura quedó detenida.
    if (Capacitor.isNativePlatform() && state.session?.status === 'active') {
      try { await LogistecGps.confirmPause({ sessionId }); } catch (releaseError) { console.warn('No se pudo liberar la pausa local fallida:', releaseError); }
    }
    toast(error.message || 'No se pudo detener el seguimiento GPS.');
  } finally { renderShift(); }
}

async function resumeShift() {
  if (!state.session?.id) return;
  try {
    if (pauseQueueRead().includes(state.session.id)) {
      const { error: pauseError } = await supabase.rpc('pause_gps_session', { p_session_id: state.session.id });
      if (pauseError && !String(pauseError.message || '').includes('La jornada no está activa')) throw pauseError;
      if (Capacitor.isNativePlatform()) {
        try { await LogistecGps.confirmPause({ sessionId: state.session.id }); }
        catch (confirmError) { pauseQueueWrite([...pauseQueueRead(), state.session.id]); throw confirmError; }
      }
      pauseQueueWrite(pauseQueueRead().filter(id => id !== state.session.id));
    }
    const { error } = await supabase.rpc('resume_gps_session', { p_session_id: state.session.id });
    if (error) throw error;
    if (state.nativeTracking) await LogistecGps.resume();
    else if (Capacitor.isNativePlatform()) {
      const auth = await supabase.auth.getSession();
      await LogistecGps.start({
        sessionId: state.session.id, supabaseUrl: SUPABASE_URL,
        publishableKey: SUPABASE_PUBLISHABLE_KEY,
        accessToken: auth.data.session.access_token,
        refreshToken: auth.data.session.refresh_token,
        userId: state.user.id,
        edgeFunctionUrl: `${SUPABASE_URL}/functions/v1/logistec-gps-ingest`,
      });
      state.nativeTracking = true;
    } else startBrowserTracking();
    state.session.status = 'active';
    state.session.localPausePending = false;
    renderShift();
    toast('Seguimiento reanudado.');
  } catch (error) { toast(error.message || 'No se pudo reanudar la jornada.'); }
}

async function finishShift() {
  if (!state.session?.id) return;
  if (!confirm('¿Finalizar la jornada? LOGISTEC dejará de recopilar tu ubicación.')) return;
  const sessionId = state.session.id;
  try {
    if (Capacitor.isNativePlatform()) { await LogistecGps.stop(); state.nativeTracking = false; }
    if (state.watchId !== null) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
    // Si había una pausa pendiente, conservarla hasta que el servidor confirme
    // la pausa o el cierre; nunca liberar la cola GPS por adelantado.
    const { error } = await supabase.rpc('finish_gps_session', { p_session_id: sessionId });
    if (error) {
      const queue = finishQueueRead(); queue.push(sessionId); finishQueueWrite(queue);
      state.finishPending = true;
      toast('GPS detenido localmente. El cierre de jornada quedó pendiente y se reintentará al recuperar conexión.');
    } else {
      state.finishPending = false;
      pauseQueueWrite(pauseQueueRead().filter(id => id !== sessionId));
      finishQueueWrite(finishQueueRead().filter(id => id !== sessionId));
      toast('Jornada finalizada. El GPS dejó de recopilar tu ubicación.');
    }
    state.session = null;
    state.finishPending = Boolean(error);
    localStorage.removeItem(userStorageKey(ACTIVE_KEY));
    $('vehicle-select').disabled = false;
    renderShift();
    if (!error && navigator.onLine) {
      try { await flushBrowserQueue(); await flushNativeQueue(); }
      catch (syncError) { console.warn('La jornada finalizó; quedan posiciones por sincronizar:', syncError); }
    }
  } catch (error) { toast(error.message || 'No se pudo finalizar la jornada.'); }
}

function activateTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => {
    const active = p.id === `tab-${name}`;
    p.classList.toggle('active', active);
    p.hidden = !active;
  });
  if (name === 'tracking') {
    if (state.map) setTimeout(() => state.map.invalidateSize(), 100);
    if (Capacitor.isNativePlatform() && state.session?.status === 'active') {
      LogistecGps.status().then((status) => {
        if (status?.lastPosition) updatePositionUI(status.lastPosition, status.lastPosition.capturedAt);
        setMessage('sync-status', status?.queuedCount ? `${status.queuedCount} posición(es) pendientes.` : 'Estado GPS actualizado.');
      }).catch((error) => console.warn('Estado GPS nativo:', error));
    }
  }
}

async function signOut() {
  if (state.session) {
    await finishShift();
    // Si el conductor canceló el cierre, no se cierra la sesión ni se deja una jornada activa inadvertida.
    if (state.session) return;
  }
  const { error } = await supabase.auth.signOut();
  if (error) return toast(error.message);
  state.user = null; state.session = null;
  setScreen(false);
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('login-submit');
  button.disabled = true;
  setMessage('login-message', 'Validando credenciales…');
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: $('login-email').value.trim(), password: $('login-password').value,
    });
    if (error) throw error;
    await refreshContext();
    toast('Sesión iniciada. Revisa tu vehículo asignado antes de comenzar.');
  } catch (error) {
    await supabase.auth.signOut();
    setMessage('login-message', error.message || 'No se pudo iniciar sesión.');
  } finally { button.disabled = false; }
});

$('recover-password').addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  if (!email) return setMessage('login-message', 'Escribe primero tu correo electrónico.');
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  setMessage('login-message', error ? error.message : 'Si el correo está registrado, recibirás instrucciones para recuperar el acceso.');
});
$('start-shift').addEventListener('click', startShift);
$('pause-shift').addEventListener('click', pauseShift);
$('resume-shift').addEventListener('click', resumeShift);
$('recover-gps').addEventListener('click', recoverGps);
$('finish-shift').addEventListener('click', finishShift);
$('signout-button').addEventListener('click', signOut);
$('refresh-context').addEventListener('click', async () => { try { await refreshContext(); toast('Datos de cuenta actualizados.'); } catch (error) { toast(error.message); } });
document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.tab)));
document.querySelectorAll('[data-open-tab]').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.openTab)));

window.addEventListener('online', async () => {
  setConnection();
  try { await attemptPendingPauses(); await attemptPendingFinishes(); await flushBrowserQueue(); await flushNativeQueue(); if (state.session?.id && pauseQueueRead().includes(state.session.id)) { state.session.status = 'paused'; state.session.localPausePending = false; renderShift(); } } catch (error) { console.warn('LOGISTEC GPS queue:', error); }
});
window.addEventListener('offline', setConnection);
setConnection();

(async () => {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    try { await refreshContext(); }
    catch (error) { await supabase.auth.signOut(); setMessage('login-message', error.message); setScreen(false); }
  }
})();
