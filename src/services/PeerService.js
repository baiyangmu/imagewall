import { Peer } from 'peerjs';
import { loadMyDBModule, ensurePersistentFS } from './MyDBService';
import ImageService from './ImageService';

class PeerService {
  constructor() {
    this.peer = null;
    this.connections = new Map(); // target_device_id -> connection
    this.isInitialized = false;
    this.messageHandlers = new Set();
    this.connectionHandlers = new Set();
    this.currentDeviceId = null;
    
    // 文件传输相关
    this.syncProgressHandlers = new Set();
    this.transferQueue = [];
    this.isTransferring = false;
    this.currentTransfer = null;
    this.chunkSize = 4096; // 4KB chunks to avoid stack overflow
    this.receivingFiles = new Map(); // fileKey -> {info, chunks, receivedChunks}
  }

  // 初始化PeerJS
  async initialize(deviceId) {
    if (this.isInitialized && this.currentDeviceId === deviceId) {
      return this.peer;
    }

    // 确保完全清理之前的连接
    if (this.peer) {
      this.destroy();
      // 等待一点时间确保清理完成
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.currentDeviceId = deviceId;
    
    try {
      console.log('正在建立局域网P2P连接...');
      
      // 为了避免ID冲突，在deviceId后添加时间戳
      const uniqueDeviceId = `${deviceId}_${Date.now()}`;
      
      // 局域网优化配置
      const config = {
        // 使用本地信令服务器
        host: 'localhost',
        port: 9001,
        path: '/',
        secure: false, // 本地开发使用HTTP
        debug: 1, // 减少调试信息
        config: {
          // 完全本地化的ICE配置 - 仅用于局域网直连
          'iceServers': [],
          // 允许所有类型的连接，但优先使用主机候选（局域网IP）
          'iceTransportPolicy': 'all',
          'iceCandidatePoolSize': 0,
          // 加快连接建立
          'bundlePolicy': 'balanced',
          'rtcpMuxPolicy': 'require'
        }
      };

      this.peer = new Peer(deviceId, config);

      return new Promise((resolve, reject) => {
        this.peer.on('open', (id) => {
          console.log('局域网P2P服务已启动，设备ID:', id);
          console.log('提示：在同一局域网的其他设备可以直接连接此ID');
          this.isInitialized = true;
          resolve(this.peer);
        });

        this.peer.on('error', (error) => {
          console.error('P2P连接错误:', error);
          // 提供更友好的错误信息
          if (error.type === 'network') {
            reject(new Error('网络连接失败，请检查网络设置'));
          } else if (error.type === 'peer-unavailable') {
            reject(new Error('目标设备不可用，请确认设备ID正确'));
          } else {
            reject(new Error(`连接失败: ${error.message}`));
          }
        });

        this.peer.on('connection', (conn) => {
          this.handleIncomingConnection(conn);
        });

        // 局域网连接通常很快，设置较短超时
        const timeout = setTimeout(() => {
          reject(new Error('连接超时，请检查网络设置'));
        }, 6000);

        this.peer.on('open', () => clearTimeout(timeout));
        this.peer.on('error', () => clearTimeout(timeout));
      });

    } catch (error) {
      console.error('初始化P2P失败:', error);
      throw error;
    }
  }

  // 处理传入的连接
  handleIncomingConnection(conn) {
    console.log('收到来自设备的连接:', conn.peer);
    
    conn.on('open', () => {
      console.log('与设备建立连接:', conn.peer);
      this.connections.set(conn.peer, conn);
      
      // 通知连接建立
      this.connectionHandlers.forEach(handler => {
        try {
          handler('connected', conn.peer);
        } catch (e) {
          console.error('连接处理器错误:', e);
        }
      });
    });

    conn.on('data', (data) => {
      console.log('收到消息:', data, '来自:', conn.peer);
      
      // 使用新的消息处理方法
      this.handleReceivedMessage(data, conn.peer);
    });

    conn.on('close', () => {
      console.log('与设备断开连接:', conn.peer);
      this.connections.delete(conn.peer);
      
      // 通知连接断开
      this.connectionHandlers.forEach(handler => {
        try {
          handler('disconnected', conn.peer);
        } catch (e) {
          console.error('连接处理器错误:', e);
        }
      });
    });

    conn.on('error', (error) => {
      console.error('连接错误:', error);
      this.connections.delete(conn.peer);
    });
  }

  // 连接到另一个设备
  async connectToDevice(targetDeviceId) {
    if (!this.peer || !this.isInitialized) {
      throw new Error('PeerJS未初始化');
    }

    if (targetDeviceId === this.currentDeviceId) {
      throw new Error('不能连接到自己');
    }

    if (this.connections.has(targetDeviceId)) {
      console.log('已经连接到设备:', targetDeviceId);
      return this.connections.get(targetDeviceId);
    }

    try {
      const conn = this.peer.connect(targetDeviceId);
      
      return new Promise((resolve, reject) => {
        conn.on('open', () => {
          console.log('成功连接到设备:', targetDeviceId);
          this.connections.set(targetDeviceId, conn);
          
          // 设置消息处理
          conn.on('data', (data) => {
            console.log('收到消息:', data, '来自:', targetDeviceId);
            this.messageHandlers.forEach(handler => {
              try {
                handler(data, targetDeviceId);
              } catch (e) {
                console.error('消息处理器错误:', e);
              }
            });
          });

          conn.on('close', () => {
            console.log('与设备断开连接:', targetDeviceId);
            this.connections.delete(targetDeviceId);
            this.connectionHandlers.forEach(handler => {
              try {
                handler('disconnected', targetDeviceId);
              } catch (e) {
                console.error('连接处理器错误:', e);
              }
            });
          });

          // 通知连接建立
          this.connectionHandlers.forEach(handler => {
            try {
              handler('connected', targetDeviceId);
            } catch (e) {
              console.error('连接处理器错误:', e);
            }
          });

          resolve(conn);
        });

        conn.on('error', (error) => {
          console.error('连接失败:', error);
          reject(error);
        });

        // 超时处理
        setTimeout(() => {
          if (!this.connections.has(targetDeviceId)) {
            reject(new Error('连接超时'));
          }
        }, 10000);
      });
    } catch (error) {
      console.error('连接设备失败:', error);
      throw error;
    }
  }

  // 发送消息到指定设备
  sendMessage(targetDeviceId, message) {
    const conn = this.connections.get(targetDeviceId);
    if (!conn) {
      throw new Error(`未连接到设备: ${targetDeviceId}`);
    }

    try {
      // 检查连接状态
      if (conn.open !== true) {
        throw new Error('连接未打开');
      }

      // 对于文件块数据，限制日志输出以提高性能
      if (message.type === 'file_chunk') {
        console.log(`发送文件块 ${message.chunkIndex + 1}/${message.totalChunks} 到:`, targetDeviceId);
      } else {
        console.log('消息发送:', message.type, '到:', targetDeviceId);
      }

      conn.send(message);
    } catch (error) {
      console.error('发送消息失败:', error);
      throw error;
    }
  }

  // 广播消息到所有连接的设备
  broadcast(message) {
    let successCount = 0;
    let errorCount = 0;

    this.connections.forEach((conn, deviceId) => {
      try {
        conn.send(message);
        successCount++;
        console.log('广播消息成功:', message, '到:', deviceId);
      } catch (error) {
        errorCount++;
        console.error('广播消息失败:', error, '到:', deviceId);
      }
    });

    return { successCount, errorCount };
  }

  // 添加消息处理器
  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  // 添加连接状态处理器
  onConnection(handler) {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  // 获取当前连接的设备列表
  getConnectedDevices() {
    return Array.from(this.connections.keys());
  }

  // 断开与指定设备的连接
  disconnectFromDevice(targetDeviceId) {
    const conn = this.connections.get(targetDeviceId);
    if (conn) {
      conn.close();
      this.connections.delete(targetDeviceId);
    }
  }

  // 销毁PeerJS连接
  destroy() {
    console.log('销毁P2P连接...');
    
    // 清理连接
    if (this.connections) {
      this.connections.forEach((conn, deviceId) => {
        try {
          console.log('关闭连接:', deviceId);
          conn.close();
        } catch (error) {
          console.warn('关闭连接失败:', error);
        }
      });
      this.connections.clear();
    }
    
    // 销毁peer
    if (this.peer) {
      try {
        this.peer.destroy();
        console.log('Peer已销毁');
      } catch (error) {
        console.warn('销毁Peer失败:', error);
      }
      this.peer = null;
    }
    
    // 重置状态
    this.isInitialized = false;
    this.currentDeviceId = null;
    
    // 清理处理器
    if (this.messageHandlers) {
      this.messageHandlers.clear();
    }
    if (this.connectionHandlers) {
      this.connectionHandlers.clear();
    }
    if (this.syncProgressHandlers) {
      this.syncProgressHandlers.clear();
    }
    
    // 清理文件接收状态
    if (this.receivingFiles) {
      this.receivingFiles.clear();
    }
  }

  // 获取状态信息
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      currentDeviceId: this.currentDeviceId,
      connectedDevices: this.getConnectedDevices(),
      peerId: this.peer?.id || null
    };
  }

  // 新增：开始同步到指定设备
  async startSync(targetDeviceId, progressCallback) {
    if (!this.connections.has(targetDeviceId)) {
      throw new Error('设备未连接');
    }

    try {
      // 发送同步请求
      this.sendMessage(targetDeviceId, {
        type: 'sync_request',
        timestamp: Date.now()
      });

      if (progressCallback) {
        this.syncProgressHandlers.add(progressCallback);
      }

      console.log('开始同步到设备:', targetDeviceId);
    } catch (error) {
      console.error('开始同步失败:', error);
      throw error;
    }
  }

  // 新增：处理同步请求
  async handleSyncRequest(fromDeviceId) {
    console.log('收到同步请求，来自:', fromDeviceId);
    
    try {
      // 1. 首先发送数据库文件
      await this.sendDatabaseFile(fromDeviceId);
      
      // 2. 然后发送所有图片
      await this.sendAllImages(fromDeviceId);
      
      // 3. 发送同步完成信号
      this.sendMessage(fromDeviceId, {
        type: 'sync_complete',
        timestamp: Date.now()
      });
      
      this.notifyProgress('sync_complete', { deviceId: fromDeviceId });
    } catch (error) {
      console.error('处理同步请求失败:', error);
      this.sendMessage(fromDeviceId, {
        type: 'sync_error',
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  // 新增：发送数据库文件
  async sendDatabaseFile(targetDeviceId) {
    try {
      console.log('开始发送数据库文件...');
      this.notifyProgress('db_start', { deviceId: targetDeviceId });

      const Module = await loadMyDBModule();
      await ensurePersistentFS(Module);
      
      const dbPath = '/persistent/test2.db';
      let dbData;
      
      try {
        dbData = Module.FS.readFile(dbPath);
      } catch (error) {
        console.log('数据库文件不存在，创建空文件');
        dbData = new Uint8Array(0);
      }

      // 发送文件信息
      this.sendMessage(targetDeviceId, {
        type: 'file_info',
        fileType: 'database',
        fileName: 'test2.db',
        fileSize: dbData.length,
        totalChunks: Math.ceil(dbData.length / this.chunkSize),
        timestamp: Date.now()
      });

      // 分块发送
      if (dbData.length > 0) {
        await this.sendFileInChunks(targetDeviceId, dbData, 'database');
      }

      console.log('数据库文件发送完成');
      this.notifyProgress('db_complete', { deviceId: targetDeviceId });
    } catch (error) {
      console.error('发送数据库文件失败:', error);
      throw error;
    }
  }

  // 新增：发送所有图片
  async sendAllImages(targetDeviceId) {
    try {
      console.log('开始发送图片...');
      
      // 获取所有图片ID
      const allImageIds = await ImageService.getAllImageIds();
      if (!allImageIds || allImageIds.length === 0) {
        console.log('没有图片需要发送');
        return;
      }

      this.notifyProgress('images_start', { 
        deviceId: targetDeviceId, 
        totalImages: allImageIds.length 
      });

      // 逐个发送图片
      for (let i = 0; i < allImageIds.length; i++) {
        const imageData = allImageIds[i];
        
        try {
          const result = await ImageService.getImage(imageData.id);
          if (result && result.blob && result.meta) {
            await this.sendImage(targetDeviceId, imageData.id, result.blob, result.meta);
            
            this.notifyProgress('image_progress', {
              deviceId: targetDeviceId,
              current: i + 1,
              total: allImageIds.length,
              imageId: imageData.id
            });
          }
        } catch (imgError) {
          console.warn(`发送图片 ${imageData.id} 失败:`, imgError);
        }
      }

      console.log('所有图片发送完成');
      this.notifyProgress('images_complete', { deviceId: targetDeviceId });
    } catch (error) {
      console.error('发送图片失败:', error);
      throw error;
    }
  }

  // 新增：发送单个图片
  async sendImage(targetDeviceId, imageId, blob, meta) {
    try {
      console.log('开始发送图片:', {
        targetDeviceId,
        imageId,
        blobSize: blob.size,
        blobType: blob.type,
        meta
      });
      
      // 将blob转换为ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // 清理meta对象，只保留必要的字段，避免循环引用
      const cleanMeta = this.cleanMetaObject(meta);
      
      console.log('清理后的meta:', cleanMeta);

      const fileInfo = {
        type: 'file_info',
        fileType: 'image',
        fileId: imageId,  // 确保与后续文件块传输一致
        imageId: imageId, // 保留imageId用于图片标识
        fileName: `${cleanMeta.hash || imageId}.${this.getFileExtension(blob.type)}`,
        fileSize: uint8Array.length,
        totalChunks: Math.ceil(uint8Array.length / this.chunkSize),
        mimeType: blob.type,
        meta: cleanMeta,
        timestamp: Date.now()
      };
      
      console.log('发送图片文件信息:', fileInfo);

      // 发送图片信息
      this.sendMessage(targetDeviceId, fileInfo);

      // 分块发送
      await this.sendFileInChunks(targetDeviceId, uint8Array, 'image', imageId);
    } catch (error) {
      console.error('发送图片失败:', error);
      throw error;
    }
  }

  // 新增：分块发送文件
  async sendFileInChunks(targetDeviceId, data, fileType, fileId = null) {
    const totalChunks = Math.ceil(data.length / this.chunkSize);
    console.log(`开始发送${fileType}文件，总块数: ${totalChunks}`);
    
    for (let i = 0; i < totalChunks; i++) {
      try {
        const start = i * this.chunkSize;
        const end = Math.min(start + this.chunkSize, data.length);
        const chunk = data.slice(start, end);
        
        // 使用Base64编码避免Array.from()导致的调用栈溢出
        const base64Data = this.uint8ArrayToBase64(chunk);
        
        // 检查连接状态
        const conn = this.connections.get(targetDeviceId);
        if (!conn || conn.open !== true) {
          throw new Error('连接已断开');
        }
        
        // 简化消息对象结构避免序列化问题
        const message = {
          type: 'file_chunk',
          fileType: fileType,
          fileId: fileId,
          chunkIndex: i,
          totalChunks: totalChunks,
          data: base64Data
        };
        
        this.sendMessage(targetDeviceId, message);

        // 动态调整延迟，前面的块延迟短，后面的块延迟长
        const delay = Math.min(50, 10 + (i * 2));
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // 每100块休息一下，避免阻塞UI
        if (i > 0 && i % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`发送第${i + 1}块失败:`, error);
        throw new Error(`文件传输在第${i + 1}/${totalChunks}块失败: ${error.message}`);
      }
    }

    console.log(`${fileType}文件发送完成，发送了${totalChunks}块`);
    
    // 发送文件完成信号
    this.sendMessage(targetDeviceId, {
      type: 'file_complete',
      fileType: fileType,
      fileId: fileId,
      timestamp: Date.now()
    });
  }

  // 新增：处理接收到的消息（扩展原有方法）
  handleReceivedMessage(data, fromDeviceId) {
    try {
      switch (data.type) {
        case 'sync_request':
          this.handleSyncRequest(fromDeviceId);
          break;
        case 'file_info':
          this.handleFileInfo(data, fromDeviceId);
          break;
        case 'file_chunk':
          this.handleFileChunk(data, fromDeviceId);
          break;
        case 'file_complete':
          this.handleFileComplete(data, fromDeviceId);
          break;
        case 'sync_complete':
          this.handleSyncComplete(data, fromDeviceId);
          break;
        case 'sync_error':
          this.handleSyncError(data, fromDeviceId);
          break;
        case 'chat':
          // 保持原有的聊天功能
          this.messageHandlers.forEach(handler => {
            try {
              handler(data, fromDeviceId);
            } catch (e) {
              console.error('消息处理器错误:', e);
            }
          });
          break;
      }
    } catch (error) {
      console.error('处理接收消息失败:', error);
    }
  }

  // 新增：处理文件信息
  handleFileInfo(data, fromDeviceId) {
    const fileKey = `${data.fileType}_${data.fileId || 'main'}`;
    
    this.receivingFiles.set(fileKey, {
      info: data,
      chunks: new Array(data.totalChunks),
      receivedChunks: 0,
      fromDeviceId: fromDeviceId
    });

    console.log(`开始接收${data.fileType}文件:`, data.fileName);
    this.notifyProgress('receive_start', {
      fileType: data.fileType,
      fileName: data.fileName,
      fileSize: data.fileSize
    });
  }

  // 新增：处理文件块
  handleFileChunk(data, fromDeviceId) {
    try {
      const fileKey = `${data.fileType}_${data.fileId || 'main'}`;
      const fileInfo = this.receivingFiles.get(fileKey);
      
      if (!fileInfo) {
        console.error('收到未知文件的块:', fileKey);
        return;
      }

      // 验证块索引
      if (data.chunkIndex < 0 || data.chunkIndex >= fileInfo.info.totalChunks) {
        console.error('无效的块索引:', data.chunkIndex);
        return;
      }

      // 验证Base64数据
      if (!data.data || typeof data.data !== 'string') {
        console.error('无效的块数据格式');
        return;
      }

      // 从Base64解码为Uint8Array
      const uint8Data = this.base64ToUint8Array(data.data);
      
      // 存储块数据
      fileInfo.chunks[data.chunkIndex] = uint8Data;
      fileInfo.receivedChunks++;

      // 更新进度
      const progress = (fileInfo.receivedChunks / fileInfo.info.totalChunks) * 100;
      
      // 限制进度通知频率，提高性能
      if (data.chunkIndex % 10 === 0 || fileInfo.receivedChunks === fileInfo.info.totalChunks) {
        this.notifyProgress('receive_progress', {
          fileType: data.fileType,
          progress: progress,
          receivedChunks: fileInfo.receivedChunks,
          totalChunks: fileInfo.info.totalChunks
        });
      }
      
      console.log(`接收文件块 ${fileInfo.receivedChunks}/${fileInfo.info.totalChunks} (${Math.round(progress)}%)`);
    } catch (error) {
      console.error('处理文件块失败:', error);
    }
  }

  // 新增：处理文件完成
  async handleFileComplete(data, fromDeviceId) {
    const fileKey = `${data.fileType}_${data.fileId || 'main'}`;
    const fileInfo = this.receivingFiles.get(fileKey);
    
    console.log('handleFileComplete调用:', {
      fileKey,
      dataFileType: data.fileType,
      dataFileId: data.fileId,
      hasFileInfo: !!fileInfo
    });
    
    if (!fileInfo) {
      console.error('收到未知文件的完成信号:', fileKey);
      return;
    }

    try {
      // 合并所有块
      const totalSize = fileInfo.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const completeFile = new Uint8Array(totalSize);
      let offset = 0;
      
      for (const chunk of fileInfo.chunks) {
        completeFile.set(chunk, offset);
        offset += chunk.length;
      }

      console.log('文件合并完成:', {
        fileType: data.fileType,
        totalSize,
        fileInfoData: fileInfo.info
      });

      // 根据文件类型处理
      if (data.fileType === 'database') {
        await this.saveDatabaseFile(completeFile);
      } else if (data.fileType === 'image') {
        console.log('准备保存图片，fileInfo.info:', fileInfo.info);
        await this.saveImageFile(fileInfo.info, completeFile);
      }

      // 清理接收状态
      this.receivingFiles.delete(fileKey);
      
      console.log(`${data.fileType}文件接收完成:`, fileInfo.info.fileName);
      this.notifyProgress('receive_complete', {
        fileType: data.fileType,
        fileName: fileInfo.info.fileName
      });
    } catch (error) {
      console.error('处理完成文件失败:', error);
    }
  }

  // 新增：保存数据库文件（直接覆盖策略）
  async saveDatabaseFile(data) {
    try {
      console.log('🗄️ 开始保存数据库文件...');
      this.notifyProgress('db_save_start', { message: '正在保存数据库文件' });
      
      const Module = await loadMyDBModule();
      await ensurePersistentFS(Module);
      
      const dbPath = '/persistent/test2.db';
      
      // 检查是否存在现有数据库
      let hasExistingDB = false;
      try {
        Module.FS.stat(dbPath);
        hasExistingDB = true;
        console.log('🔍 检测到现有数据库文件');
      } catch (e) {
        console.log('📝 未检测到现有数据库文件，将创建新文件');
      }
      
      if (hasExistingDB) {
        console.log('🗑️ 删除现有数据库文件...');
        this.notifyProgress('db_overwrite_start', { 
          message: '正在删除现有数据库，准备覆盖' 
        });
        
        try {
          Module.FS.unlink(dbPath);
          console.log('✅ 现有数据库文件已删除');
        } catch (error) {
          console.warn('⚠️ 删除现有数据库失败，尝试直接覆盖:', error);
        }
      }
      
      // 写入新数据库
      console.log('💾 写入新数据库文件...');
      this.notifyProgress('db_write_start', { 
        message: '正在写入新数据库文件',
        fileSize: data.length 
      });
      
      Module.FS.writeFile(dbPath, data);
      
      console.log('✅ 数据库文件保存成功');
      this.notifyProgress('db_save_complete', { 
        message: '数据库文件保存完成',
        action: hasExistingDB ? 'overwritten' : 'created',
        fileSize: data.length
      });
      
      // 简化的刷新确认
      const shouldRefresh = await this.showSimpleRefreshDialog(hasExistingDB);
      if (shouldRefresh) {
        console.log('🔄 刷新页面以应用新数据库...');
        window.location.reload();
      } else {
        console.log('⏰ 用户选择稍后手动刷新页面');
        this.notifyProgress('db_refresh_deferred', { 
          message: '数据库已更新，请稍后手动刷新页面以查看新数据' 
        });
      }
      
    } catch (error) {
      console.error('❌ 保存数据库文件失败:', error);
      this.notifyProgress('db_save_error', { 
        message: '保存数据库文件失败',
        error: error.message 
      });
      throw error;
    }
  }

  // 新增：简化的刷新确认对话框
  async showSimpleRefreshDialog(wasOverwritten) {
    const action = wasOverwritten ? '覆盖' : '创建';
    const message = `数据库已${action}成功！需要刷新页面以应用更改。`;
    
    return window.confirm(`🎉 ${message}\n\n是否现在刷新页面？\n\n点击"确定"立即刷新，点击"取消"稍后手动刷新。`);
  }

  // 新增：保存图片文件
  async saveImageFile(info, data) {
    try {
      console.log('开始保存图片文件:', info);
      
      // 创建Blob对象
      const blob = new Blob([data], { type: info.mimeType });
      
      // 将Blob转换为File对象，以便使用uploadImages方法
      const fileName = info.fileName || `image_${info.imageId || Date.now()}.${this.getFileExtension(info.mimeType)}`;
      const file = new File([blob], fileName, { 
        type: info.mimeType,
        lastModified: Date.now()
      });
      
      console.log('创建File对象:', {
        name: file.name,
        size: file.size,
        type: file.type,
        imageId: info.imageId
      });
      
      // 使用uploadImages方法保存图片
      const result = await ImageService.uploadImages([file]);
      
      if (result && result.uploaded_ids && result.uploaded_ids.length > 0) {
        console.log('图片保存成功, ID:', result.uploaded_ids[0]);
      } else {
        console.warn('图片保存失败，没有返回ID');
      }
      
      console.log('图片已保存:', fileName);
    } catch (error) {
      console.error('保存图片失败:', error);
      throw error;
    }
  }

  // 新增：处理同步完成
  handleSyncComplete(data, fromDeviceId) {
    console.log('同步完成，来自:', fromDeviceId);
    this.notifyProgress('sync_complete', {
      deviceId: fromDeviceId,
      timestamp: data.timestamp
    });
  }

  // 新增：处理同步错误
  handleSyncError(data, fromDeviceId) {
    console.error('同步错误，来自:', fromDeviceId, data.error);
    this.notifyProgress('sync_error', {
      deviceId: fromDeviceId,
      error: data.error
    });
  }

  // 新增：通知进度
  notifyProgress(type, data) {
    this.syncProgressHandlers.forEach(handler => {
      try {
        handler({ type, data, timestamp: Date.now() });
      } catch (e) {
        console.error('进度处理器错误:', e);
      }
    });
  }

  // 新增：添加同步进度处理器
  onSyncProgress(handler) {
    this.syncProgressHandlers.add(handler);
    return () => this.syncProgressHandlers.delete(handler);
  }

  // 新增：获取文件扩展名
  getFileExtension(mimeType) {
    const extensions = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp'
    };
    return extensions[mimeType] || 'jpg';
  }

  // 新增：清理meta对象，避免循环引用
  cleanMetaObject(meta) {
    if (!meta || typeof meta !== 'object') {
      return {};
    }

    // 只保留基本的字符串和数字字段，避免复杂对象和循环引用
    const cleanMeta = {};
    const allowedFields = ['hash', 'filename', 'uploadDate', 'size', 'width', 'height', 'type'];
    
    for (const field of allowedFields) {
      if (meta[field] !== undefined && meta[field] !== null) {
        const value = meta[field];
        // 只保留基本类型
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          cleanMeta[field] = value;
        } else if (value instanceof Date) {
          cleanMeta[field] = value.toISOString();
        }
      }
    }

    return cleanMeta;
  }

  // 新增：Uint8Array转Base64编码
  uint8ArrayToBase64(uint8Array) {
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }

  // 新增：Base64解码为Uint8Array
  base64ToUint8Array(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const uint8Array = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      uint8Array[i] = binary.charCodeAt(i);
    }
    return uint8Array;
  }
}

// 创建单例实例
const peerService = new PeerService();

export default peerService; 