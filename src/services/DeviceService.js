import { loadMyDBModule, ensurePersistentFS, openDatabase, execSQL, persistFS } from './MyDBService';

const LOCAL_KEY = 'imagewall_device_id_v1';

export function getOrCreateLocalDeviceId() {
  try {
    let id = null;
    try { id = localStorage.getItem(LOCAL_KEY); } catch (e) { id = null; }
    if (!id) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) id = crypto.randomUUID();
      else id = 'dev-' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(LOCAL_KEY, id); } catch (e) { /* ignore */ }
    }
    return id;
  } catch (e) {
    // fallback
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'dev-' + Math.random().toString(36).slice(2, 10);
  }
}

// compute 6-digit device code from device_id using sha256 -> number mod 1e6
async function deviceCodeFromDeviceId(deviceId) {
  const enc = new TextEncoder().encode(deviceId);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  // take last 8 hex chars, convert to int, mod 1e6
  const slice = hex.slice(-8);
  const n = parseInt(slice, 16);
  const code = (n % 1000000).toString().padStart(6, '0');
  return code;
}

async function ensureDevicesTable(Module, handle) {
  try {
    // try switch to devices table
    try {
      const { rc, text } = execSQL(Module, handle, 'use devices');
      if (rc === 0) return true;
    } catch (e) {
      // fallthrough to create
    }

    // if we reach here, attempt to create the table
    const createSql = 'create table devices (id int, device_id string, device_code string, created_at timestamp, is_current int)';
    try {
      const { rc } = execSQL(Module, handle, createSql);
      // attempt to use it after create
      try { execSQL(Module, handle, 'use devices'); } catch (e) {}
      return rc === 0 || true;
    } catch (e) {
      // best-effort: log and return false
      console.error('ensureDevicesTable create error', e);
      return false;
    }
  } catch (e) {
    console.error('ensureDevicesTable error', e);
    return false;
  }
}

async function getMaxDeviceId(Module, handle) {
  try {
    await ensureDevicesTable(Module, handle);
    const { rc, text } = execSQL(Module, handle, 'select id from devices order by id desc limit 1 offset 0');
    if (rc !== 0 || !text) return 0;
    try {
      const parsed = JSON.parse(text);
      const rows = parsed.rows || [];
      if (!rows.length) return 0;
      const v = rows[0].id;
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? 0 : n;
    } catch (e) { return 0; }
  } catch (e) { console.error('getMaxDeviceId error', e); return 0; }
}

export async function registerDevice(deviceId) {
  const Module = await loadMyDBModule();
  await ensurePersistentFS(Module);
  const handle = await openDatabase(Module, 'test2.db');
  await ensureDevicesTable(Module, handle);
  // check existing
  try {
    const { rc, text } = execSQL(Module, handle, `select device_code from devices where device_id = ${deviceId}`);
    if (rc === 0 && text) {
      try { const parsed = JSON.parse(text); if (parsed.rows && parsed.rows[0] && parsed.rows[0].device_code) return { device_id: deviceId, device_code: parsed.rows[0].device_code }; } catch (e) {}
    }
  } catch (e) {}

  const code = await deviceCodeFromDeviceId(deviceId);
  const id = (await getMaxDeviceId(Module, handle)) + 1;
  const created_at = String(Math.floor(Date.now() / 1000));
  const sql = `insert into devices ${id} ${deviceId} ${code} ${created_at}`;
  try {
    execSQL(Module, handle, sql);
    await persistFS(Module);
    return { device_id: deviceId, device_code: code };
  } catch (e) {
    console.error('registerDevice error', e);
    return null;
  }
}

export async function getCurrentDevice() {
  const Module = await loadMyDBModule();
  await ensurePersistentFS(Module);
  const handle = await openDatabase(Module, 'test2.db');
  await ensureDevicesTable(Module, handle);
  try {
    const { rc, text } = execSQL(Module, handle, `select device_id, device_code from devices where is_current = 1 limit 1`);
    if (rc !== 0 || !text) return null;
    try { const parsed = JSON.parse(text); const rows = parsed.rows || []; if (!rows.length) return null; return { device_id: rows[0].device_id, device_code: rows[0].device_code }; } catch (e) { return null; }
  } catch (e) { console.error('getCurrentDevice error', e); return null; }
}

export async function lookupDeviceByCode(code) {
  const Module = await loadMyDBModule();
  await ensurePersistentFS(Module);
  const handle = await openDatabase(Module, 'test2.db');
  await ensureDevicesTable(Module, handle);
  try {
    const { rc, text } = execSQL(Module, handle, `select device_id from devices where device_code = '${code}' limit 1`);
    if (rc !== 0 || !text) return null;
    try { const parsed = JSON.parse(text); const rows = parsed.rows || []; if (!rows.length) return null; return rows[0].device_id; } catch (e) { return null; }
  } catch (e) { console.error('lookupDeviceByCode error', e); return null; }
}

// Placeholder: fetch mapping from remote server by device_code
// Returns { device_id, device_code } or null. Server not implemented yet.
export async function fetchDeviceFromServer(code) {
  // TODO: call backend API when available. For now return null.
  return null;
}

export async function registerCurrentDevice(deviceId) {
  if (!deviceId) return null;
  const Module = await loadMyDBModule();
  await ensurePersistentFS(Module);
  const handle = await openDatabase(Module, 'test2.db');
  await ensureDevicesTable(Module, handle);
  try {
    const { rc, text } = execSQL(Module, handle, `select device_id, device_code from devices where is_current = 1 limit 1`);
    if (rc === 0 && text) {
      try { const parsed = JSON.parse(text); const rows = parsed.rows || []; if (rows.length) return { device_id: rows[0].device_id, device_code: rows[0].device_code }; } catch (e) {}
    }
  } catch (e) { /* ignore and try to register */ }
  // no current device, register this one
  return await registerDevice(deviceId);
}

export default {
  registerDevice,
  lookupDeviceByCode,
  registerCurrentDevice,
  getCurrentDevice,
  getOrCreateLocalDeviceId,
};


