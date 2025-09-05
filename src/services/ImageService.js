import { loadMyDBModule, ensurePersistentFS, openDatabase, execSQL, persistFS } from './MyDBService';

import { v4 as uuidv4 } from 'uuid';

// helpers
async function sha256Hex(arrayBuffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ImageService: uses mydb FS for metadata and IDBFS for blob persistence
let cached = { Module: null, handle: null };
// simple upload queue to prevent concurrent writes
let uploadQueue = Promise.resolve();

export async function initMyDB() {
  if (cached.Module && cached.handle) return cached;
  const Module = await loadMyDBModule();
  await ensurePersistentFS(Module);
  const handle = await openDatabase(Module, 'test2.db');
  cached = { Module, handle };
  return cached;
}

export async function uploadImages(files, deviceId) {
  // ensure uploads are serialized via queue
  uploadQueue = uploadQueue.then(async () => {
    const { Module, handle } = await initMyDB();
    const uploadedIds = [];
    for (const file of files) {
      const ab = await file.arrayBuffer();
      const hash = await sha256Hex(ab);
      const blobKey = hash; // use hash as blob_key

      // write blob into Ems FS under /persistent/blobs/<hash> if not exists
      try {
        const dir = '/persistent/blobs';
        try { Module.FS.mkdir(dir); } catch (e) {}
        const filePath = `${dir}/${blobKey}`;
        let needPersistBlob = false;
        try {
          Module.FS.stat(filePath);
        } catch (e) {
          // write file bytes
          const ptr = Module._malloc(ab.byteLength);
          Module.HEAPU8.set(new Uint8Array(ab), ptr);
          Module.FS.writeFile(filePath, Module.HEAPU8.subarray(ptr, ptr + ab.byteLength));
          Module._free(ptr);
          needPersistBlob = true;
        }
        if (needPersistBlob) {
          // persist the written blob to IDBFS before metadata insert
          await persistFS(Module);
        }
      } catch (e) {
        console.error('write blob to FS failed', e);
        // continue but will still attempt metadata insert
      }

      // prepare metadata
      const id = uuidv4();
      const created_at = String(Math.floor(Date.now() / 1000)); // timestamp
      // columns: id device_id created_at hash blob_key description
      const sql = `insert into images ${id} ${deviceId} ${created_at} ${hash} ${blobKey} ''`;
      try {
        const { rc, text } = execSQL(cached.Module || Module, cached.handle || handle, sql);
        if (rc === 0) uploadedIds.push(id);
        // persist metadata changes
        await persistFS(Module);
      } catch (err) {
        console.error('insert metadata failed', err);
      }
    }
    return { uploaded_ids: uploadedIds };
  });
  return uploadQueue;
}

export async function getImages(page = 1, perPage = 10) {
  const { Module, handle } = await initMyDB();
  const offset = (page - 1) * perPage;
  const sql = `select id, device_id, created_at, hash, blob_key, description from images order by created_at desc limit ${perPage} offset ${offset}`;
  const { rc, text } = execSQL(Module, handle, sql);
  if (rc !== 0 || !text) return [];
  try {
    const parsed = JSON.parse(text);
    return parsed.rows || [];
  } catch (e) {
    console.error('parse getImages result', e);
    return [];
  }
}

export async function getAllImageIds() {
  const { Module, handle } = await initMyDB();
  const { rc, text } = execSQL(Module, handle, 'select id, hash, created_at, device_id from images order by created_at desc');
  if (rc !== 0 || !text) return [];
  try { return JSON.parse(text).rows || []; } catch (e) { return []; }
}

export async function getImage(imageId) {
  const { Module, handle } = await initMyDB();
  const { rc, text } = execSQL(Module, handle, `select id, device_id, created_at, hash, blob_key, description from images where id = ${imageId}`);
  if (rc !== 0 || !text) return null;
  try {
    const parsed = JSON.parse(text);
    const rows = parsed.rows || [];
    if (!rows.length) return null;
    const meta = rows[0];
    // read blob from FS
    const filePath = `/persistent/blobs/${meta.blob_key}`;
    try {
      const data = Module.FS.readFile(filePath, { encoding: 'binary' });
      const arr = new Uint8Array(data);
      const blob = new Blob([arr]);
      return { meta, blob };
    } catch (e) {
      console.warn('blob not found in FS', e);
      return { meta, blob: null };
    }
  } catch (e) { console.error('parse getImage result', e); return null; }
}

export async function deleteImage(imageId) {
  const { Module, handle } = await initMyDB();
  // find blob_key
  const { rc, text } = execSQL(Module, handle, `select blob_key from images where id = ${imageId}`);
  if (rc !== 0 || !text) return false;
  try {
    const parsed = JSON.parse(text);
    const rows = parsed.rows || [];
    if (!rows.length) return false;
    const blobKey = rows[0].blob_key;
    execSQL(Module, handle, `delete from images where id = ${imageId}`);
    // Optionally delete blob file - keep it for dedupe safety
    await persistFS(Module);
    return true;
  } catch (e) { console.error(e); return false; }
}

export default {
  initMyDB,
  uploadImages,
  getImages,
  getImage,
  deleteImage,
  getAllImageIds,
};


