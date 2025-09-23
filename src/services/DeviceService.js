import { executeOnTableWithQueue, persistFS, execSQL } from './MyDBService';

const LOCAL_KEY = 'imagewall_device_id_v1';

/**
 * 获取或创建本地设备ID
 * 优先从localStorage读取，如果不存在则生成新的UUID并存储
 * @returns {string} 设备ID (UUID格式)
 */
export function getOrCreateLocalDeviceId() {
  try {
    let id = null;
    
    // 尝试从localStorage获取现有设备ID
    try {
      id = localStorage.getItem(LOCAL_KEY);
    } catch (e) {
      id = null;
    }
    
    // 如果没有找到，生成新的设备ID
    if (!id) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = crypto.randomUUID();
      } else {
        id = 'dev-' + Math.random().toString(36).slice(2, 10);
      }
      
      // 尝试保存到localStorage
      try {
        localStorage.setItem(LOCAL_KEY, id);
      } catch (e) {
        // ignore storage error
      }
    }
    
    return id;
  } catch (e) {
    // 降级处理：直接生成ID
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'dev-' + Math.random().toString(36).slice(2, 10);
  }
}

/**
 * 从设备ID计算6位设备代码
 * 使用SHA256哈希算法将设备ID转换为用户友好的6位数字代码
 * @param {string} deviceId - 设备ID
 * @returns {Promise<string>} 6位数字代码 (000000-999999)
 */
async function deviceCodeFromDeviceId(deviceId) {
  const enc = new TextEncoder().encode(deviceId);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // 取最后8位16进制字符转换为数字，然后取模1000000得到6位数
  const slice = hex.slice(-8);
  const n = parseInt(slice, 16);
  const code = (n % 1000000).toString().padStart(6, '0');
  
  return code;
}

// ========== 所有设备相关操作都在devices表上下文中执行 ==========

/**
 * 注册新设备到数据库
 * 如果设备已存在则返回现有信息，否则创建新记录
 * @param {string} deviceId - 设备ID
 * @returns {Promise<{device_id: string, device_code: string}|null>} 设备信息或null
 */
export async function registerDevice(deviceId) {
  return executeOnTableWithQueue('devices', async (Module, handle) => {
    // Table existence is now handled by executeOnTable
    
    // 检查设备是否已存在
    try {
      const { rc, text } = execSQL(Module, handle, `select device_code from devices where device_id = ${deviceId}`);
      
      if (rc === 0 && text) {
        try { 
          const parsed = JSON.parse(text); 
          
          if (parsed.rows && parsed.rows[0] && parsed.rows[0].device_code) {
            return { 
              device_id: deviceId, 
              device_code: parsed.rows[0].device_code 
            };
          }
        } catch (e) {
          // 解析失败，继续创建新记录
        }
      }
    } catch (e) {
      // 查询失败，继续创建新记录
    }

    // 创建新设备记录
    const code = await deviceCodeFromDeviceId(deviceId);
    const id = (await getMaxDeviceIdInternal(Module, handle)) + 1;
    const created_at = String(Math.floor(Date.now() / 1000));
    const sql = `insert into devices ${id} ${deviceId} ${code} ${created_at}`;
    
    try {
      execSQL(Module, handle, sql);
      await persistFS(Module);
      
      return { 
        device_id: deviceId, 
        device_code: code 
      };
    } catch (e) {
      console.error('registerDevice error', e);
      return null;
    }
  }, 'registerDevice');
}

/**
 * 获取当前激活的设备信息
 * 查找数据库中标记为is_current=1的设备
 * @returns {Promise<{device_id: string, device_code: string}|null>} 当前设备信息或null
 */
export async function getCurrentDevice() {
  return executeOnTableWithQueue('devices', async (Module, handle) => {
    // Table existence is now handled by executeOnTable
    
    try {
      const { rc, text } = execSQL(Module, handle, `select device_id, device_code from devices where is_current = 1 limit 1`);
      
      if (rc !== 0 || !text) {
        return null;
      }
      
      try { 
        const parsed = JSON.parse(text); 
        const rows = parsed.rows || []; 
        
        if (!rows.length) {
          return null;
        }
        
        return { 
          device_id: rows[0].device_id, 
          device_code: rows[0].device_code 
        }; 
      } catch (e) { 
        return null; 
      }
    } catch (e) { 
      console.error('getCurrentDevice error', e); 
      return null; 
    }
  }, 'getCurrentDevice');
}

/**
 * 通过设备代码查找设备ID
 * 在本地数据库中搜索指定的6位设备代码
 * @param {string} code - 6位设备代码
 * @returns {Promise<string|null>} 设备ID或null
 */
export async function lookupDeviceByCode(code) {
  return executeOnTableWithQueue('devices', async (Module, handle) => {
    // Table existence is now handled by executeOnTable
    
    try {
      const { rc, text } = execSQL(Module, handle, `select device_id from devices where device_code = '${code}' limit 1`);
      
      if (rc !== 0 || !text) {
        return null;
      }
      
      try { 
        const parsed = JSON.parse(text); 
        const rows = parsed.rows || []; 
        
        if (!rows.length) {
          return null;
        }
        
        return rows[0].device_id; 
      } catch (e) { 
        return null; 
      }
    } catch (e) { 
      console.error('lookupDeviceByCode error', e); 
      return null; 
    }
  }, 'lookupDeviceByCode');
}

/**
 * 从远程服务器获取设备信息（占位符函数）
 * 通过设备代码从服务器查找设备映射关系
 * @param {string} code - 6位设备代码
 * @returns {Promise<{device_id: string, device_code: string}|null>} 设备信息或null
 * @todo 实现实际的服务器API调用
 */
export async function fetchDeviceFromServer(code) {
  // TODO: 当服务器可用时实现实际的API调用
  // 预期的API调用：
  // try {
  //   const response = await fetch(`/api/devices/lookup/${code}`);
  //   if (response.ok) {
  //     return await response.json();
  //   }
  // } catch (e) {
  //   console.error('fetchDeviceFromServer error', e);
  // }
  return null;
}

/**
 * 注册并设置当前设备
 * 将指定设备注册到本地数据库并标记为当前激活设备
 * @param {string} deviceId - 设备ID
 * @returns {Promise<{device_id: string, device_code: string}|null>} 设备信息或null
 */
export async function registerCurrentDevice(deviceId) {
  if (!deviceId) {
    return null;
  }
  
  return executeOnTableWithQueue('devices', async (Module, handle) => {
    // Table existence is now handled by executeOnTable
    
    // 检查是否已有当前设备
    try {
      const { rc, text } = execSQL(Module, handle, `select device_id, device_code from devices where is_current = 1 limit 1`);
      
      if (rc === 0 && text) {
        try { 
          const parsed = JSON.parse(text); 
          const rows = parsed.rows || []; 
          
          if (rows.length) {
            return { 
              device_id: rows[0].device_id, 
              device_code: rows[0].device_code 
            }; 
          }
        } catch (e) {
          // 解析失败，继续注册流程
        }
      }
    } catch (e) {
      // 查询失败，继续注册流程
    }
    
    // 检查要注册的设备是否已存在
    try {
      const { rc: checkRc, text: checkText } = execSQL(Module, handle, `select device_code from devices where device_id = ${deviceId}`);
      
      if (checkRc === 0 && checkText) {
        try { 
          const parsed = JSON.parse(checkText); 
          
          if (parsed.rows && parsed.rows[0] && parsed.rows[0].device_code) {
            return { 
              device_id: deviceId, 
              device_code: parsed.rows[0].device_code 
            };
          }
        } catch (e) {
          // 解析失败，继续创建新记录
        }
      }
    } catch (e) {
      // 查询失败，继续创建新记录
    }

    // 创建新的当前设备记录
    const code = await deviceCodeFromDeviceId(deviceId);
    const id = (await getMaxDeviceIdInternal(Module, handle)) + 1;
    const created_at = String(Math.floor(Date.now() / 1000));
    const sql = `insert into devices ${id} ${deviceId} ${code} ${created_at}`;
    
    try {
      execSQL(Module, handle, sql);
      await persistFS(Module);
      
      return { 
        device_id: deviceId, 
        device_code: code 
      };
    } catch (e) {
      console.error('registerCurrentDevice error', e);
      return null;
    }
  }, 'registerCurrentDevice');
}

// ========== 内部辅助函数 - 假设已经在正确表上下文中 ==========

/**
 * 确保devices表存在，不存在则创建
 * @param {Object} Module - WebAssembly模块实例
 * @param {number} handle - 数据库句柄
 * @returns {Promise<boolean>} 表是否准备就绪
 */
async function ensureDevicesTable(Module, handle) {
  try {
    // 尝试切换到devices表
    try {
      const { rc, text } = execSQL(Module, handle, 'use devices');
      
      if (rc === 0) {
        return true;
      }
    } catch (e) {
      // 表不存在，需要创建
    }

    // 创建devices表
    const createSql = 'create table devices (id int, device_id string, device_code string, created_at timestamp, is_current int)';
    
    try {
      const { rc } = execSQL(Module, handle, createSql);
      
      // 创建后尝试切换到该表
      try {
        execSQL(Module, handle, 'use devices');
      } catch (e) {
        // 忽略切换错误
      }
      
      return rc === 0 || true;
    } catch (e) {
      console.error('ensureDevicesTable create error', e);
      return false;
    }
  } catch (e) {
    console.error('ensureDevicesTable error', e);
    return false;
  }
}

/**
 * 获取devices表中的最大ID值
 * @param {Object} Module - WebAssembly模块实例  
 * @param {number} handle - 数据库句柄
 * @returns {Promise<number>} 最大ID值，如果表为空则返回0
 */
async function getMaxDeviceIdInternal(Module, handle) {
  try {
    const { rc, text } = execSQL(Module, handle, 'select id from devices order by id desc limit 1 offset 0');
    
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
    console.error('getMaxDeviceId error', e); 
    return 0; 
  }
}

// ========== 服务对象导出 ==========

const DeviceService = {
  registerDevice,
  lookupDeviceByCode,
  registerCurrentDevice,
  getCurrentDevice,
  getOrCreateLocalDeviceId,
};

// 在浏览器控制台暴露服务用于测试和调试
if (typeof window !== 'undefined') {
  window.DeviceService = DeviceService;
}

export default DeviceService;


