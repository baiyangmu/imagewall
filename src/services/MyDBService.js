// MyDBService: initialize mydb WASM, mount IDBFS, expose helpers
import { useState, useEffect } from 'react';

let ModulePromise = null;

export function loadMyDBModule() {
  if (ModulePromise) return ModulePromise;
  // mydb.js is expected at public root (served) as /bin/mydb.js or similar
  // In this project demo, binary sits at /bin/mydb.js under public or src/bin
  ModulePromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('window not available'));
    // eslint-disable-next-line no-undef
    if (window.MyDB) {
      window.MyDB().then(resolve).catch(reject);
      return;
    }
    // try to load script dynamically
    const script = document.createElement('script');
    script.src = '/bin/mydb.js';
    script.onload = () => {
      // global MyDB should be available
      // eslint-disable-next-line no-undef
      if (window.MyDB) {
        window.MyDB().then(resolve).catch(reject);
      } else {
        reject(new Error('MyDB not found after script load'));
      }
    };
    script.onerror = (e) => reject(new Error('Failed to load mydb.js'));
    document.head.appendChild(script);
  });
  return ModulePromise;
}

export async function ensurePersistentFS(Module) {
  try { Module.FS.mkdir('/persistent'); } catch (e) {}
  try { Module.FS.mount(Module.IDBFS, {}, '/persistent'); } catch (e) {}
  return new Promise((resolve, reject) => {
    Module.FS.syncfs(true, function(err){ if (err) reject(err); else resolve(); });
  });
}

// ensure `images` table exists; create if missing
export async function ensureImagesTable(Module, handle) {
  try {
    // try to switch to images table
    const { rc, text } = execSQL(Module, handle, 'use images');
    if (rc === 0) return true;
    // Table not found or other error -> attempt to create
    const createSql = 'create table images (id int, device_id string, created_at timestamp, hash string, blob_key string, description string)';
    try {
      execSQL(Module, handle, createSql);
    } catch (e) {
      // best-effort: ignore errors here
    }
    // try again to use it
    try { execSQL(Module, handle, 'use images'); } catch (e) {}
    return true;
  } catch (e) {
    console.error('ensureImagesTable error', e);
    return false;
  }
}

// return the current max id (integer) from images table, or 0 if none
export async function getMaxImageId(Module, handle) {
  try {
    // ensure table exists
    try { await ensureImagesTable(Module, handle); } catch (e) {}
    const { rc, text } = execSQL(Module, handle, 'select id from images order by id desc limit 1 offset 0');
    if (rc !== 0 || !text) return 0;
    try {
      const parsed = JSON.parse(text);
      const rows = parsed.rows || [];
      if (!rows.length) return 0;
      const v = rows[0].id;
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? 0 : n;
    } catch (e) {
      return 0;
    }
  } catch (e) {
    console.error('getMaxImageId error', e);
    return 0;
  }
}

// open DB file in persistent dir, return handle
export async function openDatabase(Module, dbName = 'test2.db') {
  try { Module.FS.chdir('/persistent'); } catch(e){}
  const mydb_open = Module.cwrap('mydb_open_with_ems', 'number', ['string']);
  const handle = mydb_open(dbName);
  if (!handle) throw new Error('mydb_open failed');
  return handle;
}

// execute SQL and return parsed JSON (using mydb_execute_json_with_ems)
export function execSQL(Module, handle, sql) {
  const mydb_execute_json = Module.cwrap('mydb_execute_json_with_ems', 'number', ['number','number','number']);
  function allocString(str) {
    if (Module.allocateUTF8) return Module.allocateUTF8(str);
    const len = (Module.lengthBytesUTF8 ? Module.lengthBytesUTF8(str) : (new TextEncoder().encode(str).length)) + 1;
    const ptr = Module._malloc(len);
    Module.stringToUTF8(str, ptr, len);
    return ptr;
  }

  const sqlPtr = allocString(sql);
  const outPtrPtr = Module._malloc(4);
  try {
    const rc = mydb_execute_json(handle, sqlPtr, outPtrPtr);
    const outPtr = Module.getValue(outPtrPtr, 'i32');
    let text = null;
    if (outPtr) {
      text = Module.UTF8ToString(outPtr);
      Module._free(outPtr);
    }
    // Debug: print SQL execution results (rc and returned text)
    try { console.log('[execSQL]', { sql, rc, text }); } catch (e) {}
    return { rc, text };
  } finally {
    Module._free(outPtrPtr);
    Module._free(sqlPtr);
  }
}

export function persistFS(Module) {
  return new Promise((resolve) => {
    try {
      Module.FS.syncfs(false, function(err){ if (err) console.error('FS.syncfs(false) error', err); resolve(); });
    } catch (e) { console.error('persistFS error', e); resolve(); }
  });
}

export default function useMyDB() {
  const [state, setState] = useState({ Module: null, handle: null, ready: false, error: null });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const Module = await loadMyDBModule();
        await ensurePersistentFS(Module);
        const handle = await openDatabase(Module, 'test2.db');
        if (!mounted) return;
        setState({ Module, handle, ready: true, error: null });
      } catch (err) {
        console.error('useMyDB init error', err);
        if (mounted) setState({ Module: null, handle: null, ready: false, error: err });
      }
    })();
    return () => { mounted = false; };
  }, []);

  return state;
}


