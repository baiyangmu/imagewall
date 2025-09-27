import { executeWithQueue, loadMyDBModule, ensurePersistentFS, execSQL, persistFS } from './MyDBService';

/**
 * 数据库合并服务
 * 遵循现有的数据库操作模式，使用队列确保顺序执行
 */
class DatabaseMergeService {
  
  /**
   * 执行数据库合并的主流程
   * 使用队列确保整个合并过程的原子性
   * @param {Uint8Array} incomingDbData - 传入的数据库数据
   * @returns {Promise<boolean>} 合并是否成功
   */
  async mergeDatabase(incomingDbData) {
    console.log('🔄 开始数据库合并流程...');
    
    return executeWithQueue(async () => {
      const { Module, handle } = await loadMyDBModule().then(async (Module) => {
        await ensurePersistentFS(Module);
        // 注意：这里我们需要操作多个数据库，所以暂时不打开特定数据库
        return { Module, handle: null };
      });
      
      const timestamp = Date.now();
      const mainDbPath = '/persistent/imageWall.db';
      const mergedDbPath = `/persistent/imageWall_${timestamp}.db`;
      const backupDbPath = `/persistent/backup_imageWall_${timestamp}.db`;
      const tempIncomingDbPath = `/persistent/temp_incoming_${timestamp}.db`;
      
      try {
        // 步骤1：备份现有数据库
        await this.backupMainDatabase(Module, mainDbPath, backupDbPath);
        
        // 步骤2：保存传入数据库到临时文件
        Module.FS.writeFile(tempIncomingDbPath, incomingDbData);
        console.log('📁 传入数据库已保存到临时文件');
        
        // 步骤3：读取两个数据库的数据
        const mainData = await this.readDatabaseData(Module, mainDbPath);
        const incomingData = await this.readDatabaseData(Module, tempIncomingDbPath);
        
        // 步骤4：合并数据
        const mergedData = this.mergeData(mainData, incomingData);
        
        // 步骤5：创建合并后的数据库
        await this.createMergedDatabase(Module, mergedDbPath, mergedData);
        
        // 步骤6：将合并后的数据库复制为主数据库
        await this.replaceMainDatabase(Module, mergedDbPath, mainDbPath);
        
        // 步骤7：清理临时文件
        this.cleanupTempFiles(Module, [tempIncomingDbPath]);
        
        console.log('✅ 数据库合并完成');
        return mergedData.stats;
        
      } catch (error) {
        console.error('❌ 数据库合并失败:', error);
        // 清理临时文件
        this.cleanupTempFiles(Module, [tempIncomingDbPath]);
        throw error;
      }
    }, 'mergeDatabases');
  }
  
  /**
   * 备份主数据库
   */
  async backupMainDatabase(Module, mainDbPath, backupDbPath) {
    console.log('💾 开始备份主数据库...');
    
    try {
      Module.FS.stat(mainDbPath);
      const existingData = Module.FS.readFile(mainDbPath);
      Module.FS.writeFile(backupDbPath, existingData);
      console.log('✅ 主数据库已备份到:', backupDbPath);
    } catch (e) {
      console.log('📝 主数据库不存在，跳过备份');
    }
  }
  
  /**
   * 读取数据库中的所有数据
   * 遵循现有模式：打开数据库 -> 切换表 -> 立即操作 -> 关闭
   */
  async readDatabaseData(Module, dbPath) {
    console.log('📖 读取数据库数据:', dbPath);
    
    const data = { images: [], devices: [] };
    
    try {
      Module.FS.stat(dbPath);
    } catch (e) {
      console.log('数据库文件不存在:', dbPath);
      return data;
    }
    
    // 打开数据库
    const mydb_open = Module.cwrap('mydb_open_with_ems', 'number', ['string']);
    const fileName = dbPath.replace('/persistent/', '');
    const handle = mydb_open(fileName);
    
    if (!handle) {
      console.warn('无法打开数据库:', dbPath);
      return data;
    }
    
    try {
      // 读取images表 - 遵循 use table 后立即操作的模式
      try {
        console.log('📸 切换到images表并读取数据...');
        const { rc: useRc } = execSQL(Module, handle, 'use images');
        if (useRc === 0) {
          // 立即执行查询操作
          const { rc, text } = execSQL(Module, handle, 'select * from images');
          if (rc === 0 && text) {
            const parsed = JSON.parse(text);
            data.images = parsed.rows || [];
            console.log(`📸 读取到 ${data.images.length} 张图片`);
          }
        } else {
          console.log('images表不存在，跳过读取');
        }
      } catch (e) {
        console.log('images表读取失败:', e);
      }
      
      // 读取devices表 - 遵循 use table 后立即操作的模式
      try {
        console.log('📱 切换到devices表并读取数据...');
        const { rc: useRc } = execSQL(Module, handle, 'use devices');
        if (useRc === 0) {
          // 立即执行查询操作
          const { rc, text } = execSQL(Module, handle, 'select * from devices');
          if (rc === 0 && text) {
            const parsed = JSON.parse(text);
            data.devices = parsed.rows || [];
            console.log(`📱 读取到 ${data.devices.length} 个设备`);
          }
        } else {
          console.log('devices表不存在，跳过读取');
        }
      } catch (e) {
        console.log('devices表读取失败:', e);
      }
      
    } finally {
      // 关闭数据库句柄
      try {
        const mydb_close = Module.cwrap('mydb_close', 'void', ['number']);
        mydb_close(handle);
      } catch (e) {
        console.warn('关闭数据库句柄失败:', e);
      }
    }
    
    return data;
  }
  
  /**
   * 合并两个数据库的数据
   */
  mergeData(mainData, incomingData) {
    console.log('🔀 开始合并数据...');
    console.log('📊 数据统计:', {
      mainImages: mainData.images.length,
      mainDevices: mainData.devices.length,
      incomingImages: incomingData.images.length,
      incomingDevices: incomingData.devices.length
    });
    
    const stats = {
      duplicatesSkipped: 0,
      imagesAdded: 0,
      devicesAdded: 0
    };
    
    // 合并images
    const mergedImages = this.mergeImages(mainData.images, incomingData.images, stats);
    
    // 合并devices
    const mergedDevices = this.mergeDevices(mainData.devices, incomingData.devices, stats);
    
    console.log('📊 合并后数据统计:', {
      totalImages: mergedImages.length,
      totalDevices: mergedDevices.length,
      imagesAdded: stats.imagesAdded,
      devicesAdded: stats.devicesAdded,
      duplicatesSkipped: stats.duplicatesSkipped
    });
    
    return {
      images: mergedImages,
      devices: mergedDevices,
      stats: stats
    };
  }
  
  /**
   * 合并图片数据 - 按hash和created_at去重
   */
  mergeImages(mainImages, incomingImages, stats) {
    console.log('🖼️ 合并图片数据...');
    
    const imageMap = new Map();
    let maxId = 0;
    
    // 添加主数据库的图片
    mainImages.forEach(img => {
      const key = `${img.hash}_${img.created_at}`;
      imageMap.set(key, img);
      maxId = Math.max(maxId, parseInt(img.id) || 0);
    });
    
    // 添加传入数据库的图片，去重并重新分配ID
    incomingImages.forEach(img => {
      const key = `${img.hash}_${img.created_at}`;
      if (imageMap.has(key)) {
        stats.duplicatesSkipped++;
        console.log(`🔄 跳过重复图片: ${img.hash.substring(0, 8)}...`);
      } else {
        // 重新分配ID
        maxId++;
        const newImg = { ...img, id: maxId };
        imageMap.set(key, newImg);
        stats.imagesAdded++;
        console.log(`➕ 添加新图片: ${img.hash.substring(0, 8)}... (新ID: ${maxId})`);
      }
    });
    
    // 按创建时间倒序排列
    const result = Array.from(imageMap.values())
      .sort((a, b) => parseInt(b.created_at) - parseInt(a.created_at));
    
    console.log(`📊 图片合并完成: ${result.length} 张图片 (新增: ${stats.imagesAdded}, 跳过: ${stats.duplicatesSkipped})`);
    return result;
  }
  
  /**
   * 合并设备数据 - 按device_id去重
   */
  mergeDevices(mainDevices, incomingDevices, stats) {
    console.log('📱 合并设备数据...');
    
    const deviceMap = new Map();
    let maxId = 0;
    
    // 添加主数据库的设备
    mainDevices.forEach(device => {
      deviceMap.set(device.device_id, device);
      maxId = Math.max(maxId, parseInt(device.id) || 0);
    });
    
    // 添加传入数据库的设备，去重并重新分配ID
    incomingDevices.forEach(device => {
      if (deviceMap.has(device.device_id)) {
        console.log(`🔄 跳过重复设备: ${device.device_id}`);
      } else {
        // 重新分配ID
        maxId++;
        const newDevice = { ...device, id: maxId };
        deviceMap.set(device.device_id, newDevice);
        stats.devicesAdded++;
        console.log(`➕ 添加新设备: ${device.device_id} (新ID: ${maxId})`);
      }
    });
    
    const result = Array.from(deviceMap.values());
    console.log(`📊 设备合并完成: ${result.length} 个设备 (新增: ${stats.devicesAdded})`);
    return result;
  }
  
  /**
   * 创建包含合并数据的新数据库
   * 遵循现有模式：创建表 -> 切换表 -> 立即插入数据
   */
  async createMergedDatabase(Module, dbPath, mergedData) {
    console.log('🏗️ 创建新数据库:', dbPath);
    
    // 创建空数据库文件
    Module.FS.writeFile(dbPath, new Uint8Array(0));
    
    // 打开数据库
    const mydb_open = Module.cwrap('mydb_open_with_ems', 'number', ['string']);
    const fileName = dbPath.replace('/persistent/', '');
    const handle = mydb_open(fileName);
    
    if (!handle) {
      throw new Error('无法创建新数据库');
    }
    
    try {
      // 创建并填充devices表 - 遵循 use table 后立即操作的模式
      await this.createAndFillDevicesTable(Module, handle, mergedData.devices);
      
      // 创建并填充images表 - 遵循 use table 后立即操作的模式  
      await this.createAndFillImagesTable(Module, handle, mergedData.images);
      
      console.log('✅ 数据库表创建和数据填充完成');
      
    } finally {
      // 关闭数据库句柄
      try {
        const mydb_close = Module.cwrap('mydb_close', 'void', ['number']);
        mydb_close(handle);
      } catch (e) {
        console.warn('关闭数据库句柄失败:', e);
      }
    }
  }
  
  /**
   * 创建并填充devices表
   * 遵循 use table 后立即操作的模式
   */
  async createAndFillDevicesTable(Module, handle, devices) {
    console.log('📱 创建devices表...');
    
    try {
      // 创建devices表
      execSQL(Module, handle, 'create table devices (id int, device_id string, device_code string, created_at timestamp, is_current int)');
      
      // 立即切换到devices表并插入数据
      const { rc: useRc } = execSQL(Module, handle, 'use devices');
      if (useRc !== 0) {
        throw new Error('无法切换到devices表');
      }
      
      // 立即插入设备数据
      for (const device of devices) {
        const sql = `insert into devices ${device.id} ${device.device_id} ${device.device_code} ${device.created_at} ${device.is_current || 0}`;
        try {
          const { rc } = execSQL(Module, handle, sql);
          if (rc !== 0) {
            console.warn('插入设备数据失败, SQL:', sql);
          }
        } catch (e) {
          console.warn('插入设备数据异常:', e, sql);
        }
      }
      
      console.log(`✅ devices表创建完成，插入 ${devices.length} 条记录`);
    } catch (e) {
      console.error('创建devices表失败:', e);
      throw e;
    }
  }
  
  /**
   * 创建并填充images表
   * 遵循 use table 后立即操作的模式
   */
  async createAndFillImagesTable(Module, handle, images) {
    console.log('🖼️ 创建images表...');
    
    try {
      // 创建images表
      execSQL(Module, handle, 'create table images (id int, device_id string, created_at timestamp, hash string, blob_key string, description string)');
      
      // 立即切换到images表并插入数据
      const { rc: useRc } = execSQL(Module, handle, 'use images');
      if (useRc !== 0) {
        throw new Error('无法切换到images表');
      }
      
      // 立即插入图片数据
      for (const image of images) {
        const sql = `insert into images ${image.id} ${image.device_id} ${image.created_at} ${image.hash} ${image.blob_key} ${image.description || ''}`;
        try {
          const { rc } = execSQL(Module, handle, sql);
          if (rc !== 0) {
            console.warn('插入图片数据失败, SQL:', sql);
          }
        } catch (e) {
          console.warn('插入图片数据异常:', e, sql);
        }
      }
      
      console.log(`✅ images表创建完成，插入 ${images.length} 条记录`);
    } catch (e) {
      console.error('创建images表失败:', e);
      throw e;
    }
  }
  
  /**
   * 用合并后的数据库替换主数据库
   */
  async replaceMainDatabase(Module, mergedDbPath, mainDbPath) {
    console.log('🔄 替换主数据库...');
    
    try {
      // 删除旧的主数据库
      try {
        Module.FS.unlink(mainDbPath);
        console.log('🗑️ 旧主数据库已删除');
      } catch (e) {
        console.log('旧主数据库不存在，跳过删除');
      }
      
      // 复制合并后的数据库为主数据库
      const mergedData = Module.FS.readFile(mergedDbPath);
      Module.FS.writeFile(mainDbPath, mergedData);
      
      // 持久化到IndexedDB
      await persistFS(Module);
      
      console.log('✅ 主数据库替换完成');
      
    } catch (error) {
      console.error('❌ 替换主数据库失败:', error);
      throw error;
    }
  }
  
  /**
   * 清理临时文件
   */
  cleanupTempFiles(Module, tempFiles) {
    console.log('🧹 清理临时文件...');
    
    tempFiles.forEach(filePath => {
      try {
        Module.FS.unlink(filePath);
        console.log('🗑️ 已删除临时文件:', filePath);
      } catch (e) {
        console.warn('删除临时文件失败:', filePath, e);
      }
    });
  }
}

export default new DatabaseMergeService();
