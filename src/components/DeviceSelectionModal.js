import React, { useState, useEffect } from 'react';
import DeviceService from '../services/DeviceService';
import './DeviceSelectionModal.css';

const DeviceSelectionModal = ({ isOpen, onClose, onSelectDevice }) => {
  const [onlineDevices, setOnlineDevices] = useState([]);
  const [historyDevices, setHistoryDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('online'); // 'online' 或 'history'

  // 加载在线的历史设备
  const loadOnlineDevices = async () => {
    try {
      const devices = await DeviceService.getOnlineHistoryDevices();
      setOnlineDevices(devices);
    } catch (err) {
      console.error('加载在线设备失败:', err);
      throw err;
    }
  };

  // 加载历史连接的设备代码
  const loadHistoryDevices = async () => {
    try {
      const deviceCodes = await DeviceService.getConnectedDeviceCodes();
      // 转换为设备对象格式，保持与在线设备一致的结构
      const devices = deviceCodes.map(code => ({
        device_code: code,
        device_id: `history-${code}`,
        last_connected_display: '历史连接',
        is_online: false
      }));
      setHistoryDevices(devices);
    } catch (err) {
      console.error('加载历史设备失败:', err);
      throw err;
    }
  };

  // 加载所有设备数据
  const loadAllDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        loadOnlineDevices(),
        loadHistoryDevices()
      ]);
    } catch (err) {
      setError('加载设备列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 当模态框打开时加载设备列表
  useEffect(() => {
    if (isOpen) {
      loadAllDevices();
    }
  }, [isOpen]);

  // 处理设备选择
  const handleDeviceSelect = async (device) => {
    // 如果选择的是历史设备，先记录连接
    if (!device.is_online) {
      await DeviceService.addConnectedDevice(device.device_code);
    }
    onSelectDevice(device);
    onClose();
  };

  // 刷新设备列表
  const handleRefresh = () => {
    loadAllDevices();
  };

  // 获取当前标签页的设备列表
  const getCurrentDevices = () => {
    return activeTab === 'online' ? onlineDevices : historyDevices;
  };

  if (!isOpen) {
    return null;
  }

  const currentDevices = getCurrentDevices();

  return (
    <div className="device-selection-modal-overlay">
      <div className="device-selection-modal">
        <div className="device-selection-header">
          <h3>选择同步设备</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="device-selection-content">
          {/* 标签页切换 */}
          <div className="device-tabs">
            <button 
              className={`tab-btn ${activeTab === 'online' ? 'active' : ''}`}
              onClick={() => setActiveTab('online')}
            >
              🟢 在线设备 ({onlineDevices.length})
            </button>
            <button 
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              📱 历史设备 ({historyDevices.length})
            </button>
          </div>

          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              <span>正在查找设备...</span>
            </div>
          )}

          {error && (
            <div className="error-state">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
              <button className="retry-btn" onClick={handleRefresh}>重试</button>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="device-selection-toolbar">
                <span className="device-count">
                  {activeTab === 'online' 
                    ? `找到 ${currentDevices.length} 个在线设备`
                    : `找到 ${currentDevices.length} 个历史设备`
                  }
                </span>
                <button className="refresh-btn" onClick={handleRefresh}>
                  🔄 刷新
                </button>
              </div>

              <div className="device-list">
                {currentDevices.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">
                      {activeTab === 'online' ? '📱' : '📋'}
                    </span>
                    <h4>
                      {activeTab === 'online' ? '暂无在线设备' : '暂无历史设备'}
                    </h4>
                    <p>
                      {activeTab === 'online' 
                        ? '请确保其他设备已连接到此设备并保持在线'
                        : '还没有连接过其他设备'
                      }
                    </p>
                    {activeTab === 'online' && (
                      <p>或者切换到"历史设备"查看之前连接过的设备</p>
                    )}
                  </div>
                ) : (
                  currentDevices.map((device) => (
                    <div
                      key={`${activeTab}-${device.device_code}`}
                      className={`device-item ${activeTab === 'history' ? 'history-device' : ''}`}
                      onClick={() => handleDeviceSelect(device)}
                    >
                      <div className="device-info">
                        <div className="device-code-section">
                          <span className="device-code">{device.device_code}</span>
                          <span className={`status-indicator ${device.is_online ? 'online' : 'offline'}`}>
                            {device.is_online ? '🟢 在线' : '⚪ 离线'}
                          </span>
                        </div>
                        <div className="device-details">
                          {activeTab === 'online' && (
                            <>
                          <span className="device-id">设备ID: {device.device_id}</span>
                          <span className="last-connected">
                            最后连接: {device.last_connected_display}
                          </span>
                            </>
                          )}
                          {activeTab === 'history' && (
                            <span className="device-description">
                              点击尝试连接此设备
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="device-actions">
                        <button className={`select-btn ${activeTab === 'history' ? 'history-btn' : ''}`}>
                          {activeTab === 'online' ? '选择同步' : '尝试连接'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <div className="device-selection-footer">
          <button className="cancel-btn" onClick={onClose}>
            取消
          </button>
          <div className="help-text">
            💡 提示: {activeTab === 'online' 
              ? '选择一个在线设备开始同步数据库和图片'
              : '选择历史设备将尝试重新连接'
            }
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceSelectionModal;
