// MyDBService: initialize mydb WASM, mount IDBFS, expose helpers with concurrency control
import { useState, useEffect } from 'react';

let ModulePromise = null;

// ========== 全局操作队列管理 ==========
let dbOperationInProgress = false;
let operationQueue = [];

/**
 * 将数据库操作添加到队列中执行
 * 确保数据库操作的顺序性和原子性，避免并发冲突
 * @param {Function} operation - 要执行的异步操作函数
 * @param {string} operationName - 操作名称，用于调试和日志
 * @returns {Promise} 操作结果的Promise
 */
export async function executeWithQueue(operation, operationName = 'unknown') {
  return new Promise((resolve, reject) => {
    const queueItem = {
      operation,
      operationName,
      resolve,
      reject,
      timestamp: Date.now()
    };
    
    operationQueue.push(queueItem);
    processQueue();
  });
}

/**
 * 处理操作队列
 * 顺序执行队列中的数据库操作，确保不会并发执行
 * @private
 */
async function processQueue() {
  if (dbOperationInProgress || operationQueue.length === 0) {
    return;
  }
  
  dbOperationInProgress = true;
  const item = operationQueue.shift();
  
  try {
    console.log(`[DB] Starting operation: ${item.operationName}`);
    const result = await item.operation();
    item.resolve(result);
  } catch (error) {
    console.error(`[DB] Operation failed: ${item.operationName}`, error);
    item.reject(error);
  } finally {
    dbOperationInProgress = false;
    // 继续处理队列中的下一个操作
    setTimeout(processQueue, 0);
  }
}

/**
 * 在指定数据表上下文中执行操作
 * 自动切换到目标表，然后执行操作
 * @param {Object} Module - WebAssembly模块实例
 * @param {number} handle - 数据库句柄
 * @param {string} tableName - 目标表名
 * @param {Function} operation - 要在表上下文中执行的操作
 * @returns {Promise} 操作结果
 */
export async function executeOnTable(Module, handle, tableName, operation) {
  // 先确保表存在
  if (tableName === 'images') {
    try {
      await ensureImagesTable(Module, handle);
    } catch (e) {
      console.error(`Failed to ensure table ${tableName} exists:`, e);
    }
  } else if (tableName === 'devices') {
    try {
      // 尝试切换到devices表
      const { rc } = execSQL(Module, handle, 'use devices');
      
      if (rc !== 0) {
        // 表不存在，创建devices表
        execSQL(Module, handle, 'create table devices (id int, device_id string, device_code string, created_at timestamp, is_current int)');
      }
    } catch (e) {
      console.error(`Failed to ensure table ${tableName} exists:`, e);
    }
  }

  // 切换到目标表
  const useResult = execSQL(Module, handle, `use ${tableName}`);
  
  if (useResult.rc !== 0) {
    throw new Error(`Failed to switch to table ${tableName}: ${useResult.text}`);
  }
  
  // 执行目标操作
  return await operation(Module, handle);
}

/**
 * 组合队列和表操作
 * 将表操作加入队列执行，确保表切换和操作的原子性
 * @param {string} tableName - 目标表名
 * @param {Function} operation - 要执行的操作
 * @param {string} operationName - 操作名称
 * @returns {Promise} 操作结果
 */
export async function executeOnTableWithQueue(tableName, operation, operationName) {
  return executeWithQueue(async () => {
    const { Module, handle } = await initMyDB();
    return executeOnTable(Module, handle, tableName, operation);
  }, operationName);
}

/**
 * 加载MyDB WebAssembly模块
 * 动态加载mydb.js脚本并初始化WebAssembly模块
 * @returns {Promise<Object>} WebAssembly模块实例
 */
export function loadMyDBModule() {
  if (ModulePromise) {
    return ModulePromise;
  }
  
  ModulePromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('window not available'));
    }
    
    // 检查全局MyDB是否已可用
    if (window.MyDB) {
      window.MyDB().then(resolve).catch(reject);
      return;
    }
    
    // 动态加载mydb.js脚本
    const script = document.createElement('script');
    script.src = '/bin/mydb.js';
    
    script.onload = () => {
      // 脚本加载完成后检查全局MyDB
      if (window.MyDB) {
        window.MyDB().then(resolve).catch(reject);
      } else {
        reject(new Error('MyDB not found after script load'));
      }
    };
    
    script.onerror = (e) => {
      reject(new Error('Failed to load mydb.js'));
    };
    
    document.head.appendChild(script);
  });
  
  return ModulePromise;
}

/**
 * 确保持久化文件系统已挂载
 * 创建/persistent目录并挂载IDBFS，同步IndexedDB中的数据
 * @param {Object} Module - WebAssembly模块实例
 * @returns {Promise<void>}
 */
export async function ensurePersistentFS(Module) {
  try {
    Module.FS.mkdir('/persistent');
  } catch (e) {
    // 目录已存在，忽略错误
  }
  
  try {
    Module.FS.mount(Module.IDBFS, {}, '/persistent');
  } catch (e) {
    // 已挂载，忽略错误
  }
  
  return new Promise((resolve, reject) => {
    Module.FS.syncfs(true, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * 确保images表存在，不存在则创建
 * @param {Object} Module - WebAssembly模块实例
 * @param {number} handle - 数据库句柄
 * @returns {Promise<boolean>} 表是否准备就绪
 */
export async function ensureImagesTable(Module, handle) {
  try {
    // 尝试切换到images表
    const { rc, text } = execSQL(Module, handle, 'use images');
    
    if (rc === 0) {
      return true;
    }
    
    // 表不存在或其他错误 -> 尝试创建表
    const createSql = 'create table images (id int, device_id string, created_at timestamp, hash string, blob_key string, description string)';
    
    try {
      execSQL(Module, handle, createSql);
    } catch (e) {
      console.log(e)
    }
    
    // 再次尝试使用表
    try {
      execSQL(Module, handle, 'use images');
    } catch (e) {
      console.log(e);
    }
    
    return true;
  } catch (e) {
    console.error('ensureImagesTable error', e);
    return false;
  }
}

/**
 * 获取images表中的最大ID值
 * @param {Object} Module - WebAssembly模块实例
 * @param {number} handle - 数据库句柄
 * @returns {Promise<number>} 最大ID值，如果表为空则返回0
 */
export async function getMaxImageId(Module, handle) {
  try {
    // 确保表存在
    try {
      await ensureImagesTable(Module, handle);
    } catch (e) {
      // 忽略表创建错误
    }
    
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
  } catch (e) {
    console.error('getMaxImageId error', e);
    return 0;
  }
}

/**
 * 打开数据库文件
 * 在持久化目录中打开指定的数据库文件
 * @param {Object} Module - WebAssembly模块实例
 * @param {string} dbName - 数据库文件名，默认为'test2.db'
 * @returns {number} 数据库句柄
 * @throws {Error} 如果打开数据库失败
 */
export async function openDatabase(Module, dbName = 'test2.db') {
  try {
    Module.FS.chdir('/persistent');
  } catch(e) {
    // 忽略切换目录错误
  }
  
  const mydb_open = Module.cwrap('mydb_open_with_ems', 'number', ['string']);
  const handle = mydb_open(dbName);
  
  if (!handle) {
    throw new Error('mydb_open failed');
  }
  
  return handle;
}

/**
 * 执行SQL语句并返回JSON格式结果
 * 使用WebAssembly接口执行SQL并解析返回的JSON数据
 * @param {Object} Module - WebAssembly模块实例
 * @param {number} handle - 数据库句柄
 * @param {string} sql - 要执行的SQL语句
 * @returns {{rc: number, text: string|null}} 执行结果，rc为返回码，text为JSON字符串
 */
export function execSQL(Module, handle, sql) {
  const mydb_execute_json = Module.cwrap('mydb_execute_json_with_ems', 'number', ['number','number','number']);
  
  /**
   * 分配UTF8字符串内存
   * @param {string} str - 要分配的字符串
   * @returns {number} 内存指针
   */
  function allocString(str) {
    if (Module.allocateUTF8) {
      return Module.allocateUTF8(str);
    }
    
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
    
    // 调试：打印SQL执行结果
    try {
      console.log('[execSQL]', { sql, rc, text });
    } catch (e) {
      // 忽略日志错误
    }
    
    return { rc, text };
  } finally {
    Module._free(outPtrPtr);
    Module._free(sqlPtr);
  }
}

/**
 * 持久化文件系统到IndexedDB
 * 将内存中的文件系统变更同步到浏览器IndexedDB
 * @param {Object} Module - WebAssembly模块实例
 * @returns {Promise<void>}
 */
export function persistFS(Module) {
  return new Promise((resolve) => {
    try {
      Module.FS.syncfs(false, function(err) {
        if (err) {
          console.error('FS.syncfs(false) error', err);
        }
        resolve();
      });
    } catch (e) {
      console.error('persistFS error', e);
      resolve();
    }
  });
}

// ========== 初始化缓存机制 ==========
let cached = { Module: null, handle: null };

/**
 * 初始化MyDB实例
 * 加载WebAssembly模块、挂载持久化文件系统并打开数据库
 * 使用缓存避免重复初始化
 * @returns {Promise<{Module: Object, handle: number}>} 模块实例和数据库句柄
 */
export async function initMyDB() {
  if (cached.Module && cached.handle) {
    return cached;
  }
  
  const Module = await loadMyDBModule();
  await ensurePersistentFS(Module);
  const handle = await openDatabase(Module, 'test2.db');
  
  cached = { Module, handle };
  return cached;
}

// ========== 调试工具 ==========

/**
 * 数据库调试工具集合
 * 提供队列状态查看和清理功能
 */
export const DBDebug = {
  /**
   * 获取当前队列状态
   * @returns {Object} 队列状态信息
   */
  getQueueStatus: () => ({
    inProgress: dbOperationInProgress,
    queueLength: operationQueue.length,
    queue: operationQueue.map(item => ({
      operation: item.operationName,
      waitTime: Date.now() - item.timestamp
    }))
  }),
  
  /**
   * 清空操作队列
   * 危险操作：清空所有待执行的操作
   */
  clearQueue: () => {
    operationQueue.length = 0;
    dbOperationInProgress = false;
  }
};

// 在浏览器控制台暴露调试工具
if (typeof window !== 'undefined') {
  window.DBDebug = DBDebug;
}

/**
 * React Hook: 使用MyDB
 * 在React组件中初始化和使用MyDB实例
 * @returns {{Module: Object|null, handle: number|null, ready: boolean, error: Error|null}} 
 */
export default function useMyDB() {
  const [state, setState] = useState({
    Module: null,
    handle: null,
    ready: false,
    error: null
  });

  useEffect(() => {
    let mounted = true;
    
    (async () => {
      try {
        const Module = await loadMyDBModule();
        await ensurePersistentFS(Module);
        const handle = await openDatabase(Module, 'test2.db');
        
        if (!mounted) {
          return;
        }
        
        setState({
          Module,
          handle,
          ready: true,
          error: null
        });
      } catch (err) {
        console.error('useMyDB init error', err);
        
        if (mounted) {
          setState({
            Module: null,
            handle: null,
            ready: false,
            error: err
          });
        }
      }
    })();
    
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}


