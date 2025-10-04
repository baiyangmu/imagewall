import { executeOnTableWithQueue, persistFS, execSQL, ensureImagesTable } from './MyDBService';
import DeviceService from './DeviceService';

// ========== 辅助工具函数 ==========

/**
 * 计算数据的SHA256哈希值
 * 用于生成图片文件的唯一标识符
 * @param {ArrayBuffer} arrayBuffer - 要计算哈希的数据
 * @returns {Promise<string>} 十六进制格式的哈希值
 */
async function sha256Hex(arrayBuffer) {
  // 检查是否支持Web Crypto API
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('[ImageService] Web Crypto API failed, falling back to simple hash:', e);
    }
  }
  
  // 降级处理：使用简单的哈希算法
  return simpleHash(arrayBuffer);
}


/**
 * 简单的哈希函数，用作Web Crypto API的降级替代
 * @param {ArrayBuffer} arrayBuffer - 要计算哈希的数据
 * @returns {string} 十六进制格式的哈希值
 */
function simpleHash(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let hash = 0;
  let secondHash = 0;
  
  // 使用两个不同的哈希算法来减少冲突
  for (let i = 0; i < bytes.length; i++) {
    // 第一个哈希算法
    hash = ((hash << 5) - hash + bytes[i]) & 0xffffffff;
    // 第二个哈希算法
    secondHash = ((secondHash << 3) + secondHash + bytes[i] * 17) & 0xffffffff;
  }
  
  // 组合两个哈希值并转换为十六进制
  const combined = (Math.abs(hash) + Math.abs(secondHash)).toString(16);
  // 确保哈希长度足够，并添加文件大小作为额外的唯一性
  const sizeHash = arrayBuffer.byteLength.toString(16);
  return (combined + sizeHash).padStart(32, '0').slice(0, 32);
}

// ========== 所有图片相关操作都在images表上下文中执行 ==========

/**
 * 上传多个图片文件到数据库
 * 包含文件去重、Blob存储和元数据记录功能
 * @param {File[]} files - 要上传的文件数组
 * @returns {Promise<{uploaded_ids: number[]}>} 上传成功的图片ID数组
 */
export async function uploadImages(files) {
  console.log('[ImageService] 开始上传图片，文件数量:', files.length);
  
  // 先获取设备ID，避免在表上下文中嵌套调用
  let effectiveDeviceId = null;
  
  try {
    console.log('[ImageService] 尝试获取当前设备');
    const cur = await DeviceService.getCurrentDevice();
    console.log('[ImageService] 获取当前设备结果:', cur);
    
    if (cur && cur.device_id) {
      effectiveDeviceId = cur.device_id;
      console.log('[ImageService] 使用现有设备ID:', effectiveDeviceId);
    }
  } catch (e) {
    console.warn('[ImageService] 获取当前设备失败:', e);
    // 忽略获取当前设备失败的错误
  }
  
  if (!effectiveDeviceId) {
    // 使用DeviceService辅助方法获取或创建本地设备ID（与App.js保持一致）
    try {
      console.log('[ImageService] 尝试创建本地设备ID');
      const local = DeviceService.getOrCreateLocalDeviceId();
      console.log('[ImageService] 创建的本地设备ID:', local);
      await DeviceService.registerCurrentDevice(local);
      console.log('[ImageService] 注册设备完成');
      effectiveDeviceId = local;
    } catch (e) {
      console.error('[ImageService] 创建/注册设备失败:', e);
      effectiveDeviceId = '';
    }
  }
  
  console.log('[ImageService] 最终使用的设备ID:', effectiveDeviceId);
  
  // 确保有设备ID后，再执行表操作
  return executeOnTableWithQueue('images', async (Module, handle) => {
    console.log('[ImageService] executeOnTableWithQueue回调开始执行');
    
    const uploadedIds = [];
    
    // 为这批文件分配连续的整数ID
    console.log('[ImageService] 获取最大图片ID');
    let nextId = (await getMaxImageIdInternal(Module, handle)) + 1;
    console.log('[ImageService] 下一个可用ID:', nextId);
    
    // 逐个处理文件
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`[ImageService] 处理第${i+1}/${files.length}个文件, 名称:${file.name}, 大小:${(file.size/1024).toFixed(2)}KB`);
      
      console.time(`文件${i+1}读取`); 
      const ab = await file.arrayBuffer();
      console.timeEnd(`文件${i+1}读取`);
      console.log(`[ImageService] 文件内容读取完成，大小:${(ab.byteLength/1024).toFixed(2)}KB，计算哈希...`);
      
      console.time(`文件${i+1}哈希计算`);
      const hash = await sha256Hex(ab);
      console.timeEnd(`文件${i+1}哈希计算`);
      const blobKey = hash; // 使用哈希作为blob_key
      console.log(`[ImageService] 文件哈希值:${hash}`);

      // 将blob写入Emscripten文件系统的/persistent/blobs/<hash>路径（如果不存在）
      try {
        const dir = '/persistent/blobs';
        
        try {
          console.log('[ImageService] 确保blob目录存在');
          Module.FS.mkdir(dir);
        } catch (e) {
          // 目录已存在，忽略错误
          console.log('[ImageService] blob目录已存在');
        }
        
        const filePath = `${dir}/${blobKey}`;
        let needPersistBlob = false;
        
        try {
          console.log(`[ImageService] 检查blob文件是否已存在: ${filePath}`);
          Module.FS.stat(filePath);
          console.log('[ImageService] 文件已存在，无需重写');
          // 文件已存在，无需重写
        } catch (e) {
          // 文件不存在，需要写入
          console.log('[ImageService] 文件不存在，准备写入...');
          try {
            console.log('[ImageService] 使用直接写入方式');
            // 直接从Uint8Array写入文件字节，避免依赖HEAPU8
            console.time('直接写入文件');
            Module.FS.writeFile(filePath, new Uint8Array(ab));
            console.timeEnd('直接写入文件');
            needPersistBlob = true;
            console.log('[ImageService] 文件写入完成(直接方式)');
          } catch (innerErr) {
            console.warn('[ImageService] 直接写入失败，尝试降级方法:', innerErr);
            // 降级到malloc/write方法
            const ptr = Module._malloc(ab.byteLength);
            const arr = new Uint8Array(ab);
            
            console.time('降级写入文件');
            if (typeof Module.writeArrayToMemory === 'function') {
              console.log('[ImageService] 使用writeArrayToMemory方法');
              Module.writeArrayToMemory(arr, ptr);
            } else if (Module.HEAPU8) {
              console.log('[ImageService] 使用HEAPU8.set方法');
              Module.HEAPU8.set(arr, ptr);
            } else {
              throw new Error('no method available to write to wasm memory');
            }
            
            const dataToWrite = Module.HEAPU8 ? 
              Module.HEAPU8.subarray(ptr, ptr + ab.byteLength) : arr;
            Module.FS.writeFile(filePath, dataToWrite);
            Module._free(ptr);
            console.timeEnd('降级写入文件');
            needPersistBlob = true;
            console.log('[ImageService] 文件写入完成(降级方式)');
          }
        }
        
        if (needPersistBlob) {
          // 在插入元数据之前持久化写入的blob
          console.log('[ImageService] 持久化blob文件开始');
          console.time('persistFS-blob');
          await persistFS(Module);
          console.timeEnd('persistFS-blob');
          console.log('[ImageService] 持久化blob文件完成');
        }
      } catch (e) {
        console.error('[ImageService] write blob to FS failed', e);
        // 继续执行，但仍会尝试插入元数据
      }

      // 准备元数据 - 现在已经在正确的images表上下文中
      const id = nextId;
      nextId += 1;
      
      // 秒级时间戳（例如 1756125828）
      const created_at = String(Math.floor(Date.now() / 1000));
      
      // 字段顺序：id device_id created_at hash blob_key description
      const sql = `insert into images ${id} ${effectiveDeviceId} ${created_at} ${hash} ${blobKey} ''`;
      console.log(`[ImageService] 准备插入元数据, SQL: ${sql}`);
      
      try {
        console.time('execSQL-metadata');
        const { rc, text } = execSQL(Module, handle, sql);
        console.timeEnd('execSQL-metadata');
        console.log(`[ImageService] SQL执行结果, rc=${rc}, text=${text}`);
        
        if (rc === 0) {
          uploadedIds.push(id);
          console.log(`[ImageService] 元数据插入成功，ID=${id}`);
        } else {
          console.error(`[ImageService] 元数据插入失败，rc=${rc}`);
        }
        
        // 持久化元数据变更
        console.log('[ImageService] 持久化元数据变更开始');
        console.time('persistFS-metadata');
        await persistFS(Module);
        console.timeEnd('persistFS-metadata');
        console.log('[ImageService] 持久化元数据变更完成');
      } catch (err) {
        console.error('[ImageService] insert metadata failed', err);
      }
    }
    
    console.log(`[ImageService] 所有文件处理完成，成功上传ID:`, uploadedIds);
    return { uploaded_ids: uploadedIds };
  }, 'uploadImages');
}

/**
 * 分页获取图片列表
 * 按创建时间倒序返回图片元数据
 * @param {number} page - 页码，从1开始
 * @param {number} perPage - 每页数量，默认10
 * @returns {Promise<Array>} 图片元数据数组
 */
export async function getImages(page = 1, perPage = 10) {
  return executeOnTableWithQueue('images', async (Module, handle) => {
    // Table existence is now handled by executeOnTable
    
    const offset = (page - 1) * perPage;
    const sql = `select id, device_id, created_at, hash, blob_key, description from images order by created_at desc limit ${perPage} offset ${offset}`;
    
    const { rc, text } = execSQL(Module, handle, sql);
    
    if (rc !== 0 || !text) {
      return [];
    }
    
    try {
      const parsed = JSON.parse(text);
      return parsed.rows || [];
    } catch (e) {
      console.error('parse getImages result', e);
      return [];
    }
  }, 'getImages');
}

/**
 * 获取所有图片ID和基本信息
 * 按创建时间倒序返回，用于批量操作或同步
 * @returns {Promise<Array>} 包含ID、哈希、创建时间和设备ID的数组
 */
export async function getAllImageIds() {
  return executeOnTableWithQueue('images', async (Module, handle) => {
    // Table existence is now handled by executeOnTable
    const { rc, text } = execSQL(Module, handle, 'select id, hash, created_at, device_id from images order by created_at desc');
    
    if (rc !== 0 || !text) {
      return [];
    }
    
    try {
      return JSON.parse(text).rows || [];
    } catch (e) {
      return [];
    }
  }, 'getAllImageIds');
}

/**
 * 获取单个图片的完整信息
 * 包含元数据和Blob数据
 * @param {number|string} imageId - 图片ID
 * @returns {Promise<{meta: Object, blob: Blob}|null>} 图片信息对象或null
 */
export async function getImage(imageId) {
  // 防止无效ID导致的"where id = null"查询
  if (imageId === null || imageId === undefined) {
    return null;
  }
  
  return executeOnTableWithQueue('images', async (Module, handle) => {
    // Table existence is now handled by executeOnTable
    
    const { rc, text } = execSQL(Module, handle, `select id, device_id, created_at, hash, blob_key, description from images where id = ${imageId}`);
    
    if (rc !== 0 || !text) {
      return null;
    }
    
    try {
      const parsed = JSON.parse(text);
      const rows = parsed.rows || [];
      
      if (!rows.length) {
        return null;
      }
      
      const meta = rows[0];
      
      // 从文件系统读取blob，使用重试机制避免与IDB持久化的竞态条件
      const filePath = `/persistent/blobs/${meta.blob_key}`;
      const maxAttempts = 6;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const data = Module.FS.readFile(filePath, { encoding: 'binary' });
          const arr = new Uint8Array(data);
          
          // 创建数组副本以避免内存问题
          const copy = new Uint8Array(arr.length);
          copy.set(arr);
          
          const blob = new Blob([copy]);
          return { meta, blob };
        } catch (err) {
          if (attempt === maxAttempts) {
            console.warn('blob not found in FS after retries', err);
            return { meta, blob: null };
          }
          
          // 等待后重试
          await new Promise((res) => setTimeout(res, 100 * attempt));
        }
      }
      
      return { meta, blob: null };
    } catch (e) {
      console.error('parse getImage result', e);
      return null;
    }
  }, 'getImage');
}

/**
 * 删除指定图片
 * 删除数据库记录，可选择保留blob文件用于去重安全
 * @param {number|string} imageId - 要删除的图片ID
 * @returns {Promise<boolean>} 删除是否成功
 */
export async function deleteImage(imageId) {
  return executeOnTableWithQueue('images', async (Module, handle) => {
    // Table existence is now handled by executeOnTable
    
    // 查找blob_key
    const { rc, text } = execSQL(Module, handle, `select blob_key from images where id = ${imageId}`);
    
    if (rc !== 0 || !text) {
      return false;
    }
    
    try {
      const parsed = JSON.parse(text);
      const rows = parsed.rows || [];
      
      if (!rows.length) {
        return false;
      }
      
      const blobKey = rows[0].blob_key;
      
      // 删除数据库记录
      execSQL(Module, handle, `delete from images where id = ${imageId}`);
      
      // 可选：删除blob文件 - 为了去重安全性，保留文件
      // 如果需要删除物理文件，取消下面的注释：
      // try {
      //   Module.FS.unlink(`/persistent/blobs/${blobKey}`);
      // } catch (e) {
      //   console.warn('failed to delete blob file', e);
      // }
      
      await persistFS(Module);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, 'deleteImage');
}

// ========== 内部辅助函数 - 假设已经在正确表上下文中 ==========

/**
 * 获取images表中的最大ID值（内部函数）
 * 假设已经在正确的表上下文中执行
 * @param {Object} Module - WebAssembly模块实例
 * @param {number} handle - 数据库句柄
 * @returns {Promise<number>} 最大ID值，如果表为空则返回0
 */
async function getMaxImageIdInternal(Module, handle) {
  const { rc, text } = execSQL(Module, handle, 'select id from images order by id desc limit 1 offset 0');
  
  if (rc !== 0 || !text) {
    return 0;
  }
  
  try {
    const parsed = JSON.parse(text);
    const rows = parsed.rows || [];
    
    if (!rows.length) {
      return 0;
    }
    
    const v = rows[0].id;
    const n = parseInt(v, 10);
    
    return Number.isNaN(n) ? 0 : n;
  } catch (e) {
    return 0;
  }
}

// ========== 服务对象导出 ==========

const ImageService = {
  uploadImages,
  getImages,
  getImage,
  deleteImage,
  getAllImageIds,
};

// 在浏览器控制台暴露服务用于测试和调试
if (typeof window !== 'undefined') {
  window.ImageService = ImageService;
}

export default ImageService;


