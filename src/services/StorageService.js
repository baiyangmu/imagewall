// StorageService: 简化的存储配额检测服务
export class StorageService {
  constructor() {
    this.listeners = new Set();
    this.lastEstimate = null;
    console.log('[StorageService] 服务初始化');
  }

  /**
   * 检查浏览器是否支持Storage API
   * @returns {boolean} 是否支持
   */
  isSupported() {
    const supported = typeof navigator !== 'undefined' && 
                     'storage' in navigator && 
                     'estimate' in navigator.storage;
    console.log('[StorageService] 支持检查结果:', supported);
    return supported;
  }

  /**
   * 获取存储使用情况估算
   * @returns {Promise<{usage: number, quota: number, percentage: number, remaining: number, supported: boolean}>}
   */
  async getStorageEstimate() {
    console.log('[StorageService] 开始获取存储估算');
    
    if (!this.isSupported()) {
      console.warn('[StorageService] 浏览器不支持Storage API');
      return {
        usage: 0,
        quota: 0,
        percentage: 0,
        remaining: 0,
        supported: false,
        error: 'Storage API not supported'
      };
    }

    try {
      console.log('[StorageService] 调用 navigator.storage.estimate()');
      const estimate = await navigator.storage.estimate();
      console.log('[StorageService] 原始估算结果:', estimate);
      
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;
      const remaining = quota - usage;

      const result = {
        usage,
        quota,
        percentage,
        remaining,
        supported: true,
        lastUpdated: new Date().toISOString()
      };

      console.log('[StorageService] 处理后的结果:', result);
      this.lastEstimate = result;
      this.notifyListeners(result);
      
      return result;
    } catch (error) {
      console.error('[StorageService] 获取存储估算失败:', error);
      
      // 尝试提供一个fallback估算
      const fallbackResult = {
        usage: 0,
        quota: 0,
        percentage: 0,
        remaining: 0,
        supported: false,
        error: `获取失败: ${error.message}`
      };
      
      return fallbackResult;
    }
  }

  /**
   * 格式化字节数为可读格式
   * @param {number} bytes 字节数
   * @returns {string} 格式化后的字符串
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * 添加存储状态监听器
   * @param {Function} callback 回调函数
   * @returns {Function} 移除监听器的函数
   */
  addListener(callback) {
    console.log('[StorageService] 添加监听器');
    this.listeners.add(callback);
    
    // 如果有缓存的估算数据，立即通知
    if (this.lastEstimate) {
      console.log('[StorageService] 立即通知缓存数据:', this.lastEstimate);
      callback(this.lastEstimate);
    }
    
    return () => {
      console.log('[StorageService] 移除监听器');
      this.listeners.delete(callback);
    };
  }

  /**
   * 通知所有监听器
   * @private
   */
  notifyListeners(estimate) {
    console.log('[StorageService] 通知所有监听器:', estimate, '监听器数量:', this.listeners.size);
    this.listeners.forEach(callback => {
      try {
        callback(estimate);
      } catch (error) {
        console.error('[StorageService] 存储监听器回调错误:', error);
      }
    });
  }
}

// 创建单例实例
const storageService = new StorageService();
console.log('[StorageService] 单例实例已创建');
export default storageService; 