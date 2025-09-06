import { loadMyDBModule, ensurePersistentFS, openDatabase, execSQL, persistFS, ensureImagesTable, getMaxImageId } from './MyDBService';

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
  // ensure images table exists before any operations
  try { await ensureImagesTable(Module, handle); } catch (e) { console.error('ensureImagesTable failed', e); }
  cached = { Module, handle };
  return cached;
}

export async function uploadImages(files, deviceId) {
  // ensure uploads are serialized via queue
  uploadQueue = uploadQueue.then(async () => {
    const { Module, handle } = await initMyDB();
    // ensure images table exists before inserting
    try { await ensureImagesTable(Module, handle); } catch (e) { console.error('ensureImagesTable failed', e); }
    const uploadedIds = [];
    // allocate monotonic integer ids for this batch
    let nextId = (await getMaxImageId(Module, handle)) + 1;
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
          // write file bytes directly from Uint8Array to avoid relying on HEAPU8
          try {
            Module.FS.writeFile(filePath, new Uint8Array(ab));
            needPersistBlob = true;
          } catch (innerErr) {
            // fallback to malloc/write if direct write fails
            const ptr = Module._malloc(ab.byteLength);
            const arr = new Uint8Array(ab);
            if (typeof Module.writeArrayToMemory === 'function') {
              Module.writeArrayToMemory(arr, ptr);
            } else if (Module.HEAPU8) {
              Module.HEAPU8.set(arr, ptr);
            } else {
              throw new Error('no method available to write to wasm memory');
            }
            Module.FS.writeFile(filePath, Module.HEAPU8 ? Module.HEAPU8.subarray(ptr, ptr + ab.byteLength) : arr);
            Module._free(ptr);
            needPersistBlob = true;
          }
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
      const id = nextId; nextId += 1;
      // seconds-since-epoch timestamp (e.g. 1756125828)
      const created_at = String(Math.floor(Date.now() / 1000));
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
  try { await ensureImagesTable(Module, handle); } catch (e) { console.error('ensureImagesTable failed', e); }
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
  try { await ensureImagesTable(Module, handle); } catch (e) { console.error('ensureImagesTable failed', e); }
  const { rc, text } = execSQL(Module, handle, 'select id, hash, created_at, device_id from images order by created_at desc');
  if (rc !== 0 || !text) return [];
  try { return JSON.parse(text).rows || []; } catch (e) { return []; }
}

export async function getImage(imageId) {
  // guard against invalid id to avoid "where id = null" queries
  if (imageId === null || imageId === undefined) return null;
  const { Module, handle } = await initMyDB();
  try { await ensureImagesTable(Module, handle); } catch (e) { console.error('ensureImagesTable failed', e); }
  const { rc, text } = execSQL(Module, handle, `select id, device_id, created_at, hash, blob_key, description from images where id = ${imageId}`);
  if (rc !== 0 || !text) return null;
  try {
    const parsed = JSON.parse(text);
    const rows = parsed.rows || [];
    if (!rows.length) return null;
    const meta = rows[0];
    // read blob from FS with retries to avoid race with IDB persistence
    const filePath = `/persistent/blobs/${meta.blob_key}`;
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const data = Module.FS.readFile(filePath, { encoding: 'binary' });
        const arr = new Uint8Array(data);
        const copy = new Uint8Array(arr.length);
        copy.set(arr);
        const blob = new Blob([copy]);
        return { meta, blob };
      } catch (err) {
        if (attempt === maxAttempts) {
          console.warn('blob not found in FS after retries', err);
          return { meta, blob: null };
        }
        await new Promise((res) => setTimeout(res, 100 * attempt));
      }
    }
    return { meta, blob: null };
  } catch (e) { console.error('parse getImage result', e); return null; }
}

export async function deleteImage(imageId) {
  const { Module, handle } = await initMyDB();
  try { await ensureImagesTable(Module, handle); } catch (e) { console.error('ensureImagesTable failed', e); }
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


