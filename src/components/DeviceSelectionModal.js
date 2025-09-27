import React, { useState, useEffect } from 'react';
import DeviceService from '../services/DeviceService';
import './DeviceSelectionModal.css';

const DeviceSelectionModal = ({ isOpen, onClose, onSelectDevice }) => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 加载在线的历史设备
  const loadOnlineDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const onlineDevices = await DeviceService.getOnlineHistoryDevices();
      setDevices(onlineDevices);
    } catch (err) {
      console.error('加载在线设备失败:', err);
      setError('加载设备列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 当模态框打开时加载设备列表
  useEffect(() => {
    if (isOpen) {
      loadOnlineDevices();
    }
  }, [isOpen]);

  // 处理设备选择
  const handleDeviceSelect = (device) => {
    onSelectDevice(device);
    onClose();
  };

  // 刷新设备列表
  const handleRefresh = () => {
    loadOnlineDevices();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="device-selection-modal-overlay">
      <div className="device-selection-modal">
        <div className="device-selection-header">
          <h3>选择同步设备</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="device-selection-content">
          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              <span>正在查找在线设备...</span>
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
                  找到 {devices.length} 个在线设备
                </span>
                <button className="refresh-btn" onClick={handleRefresh}>
                  🔄 刷新
                </button>
              </div>

              <div className="device-list">
                {devices.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">📱</span>
                    <h4>暂无在线设备</h4>
                    <p>请确保其他设备已连接到此设备并保持在线</p>
                    <p>或者先与其他设备建立连接</p>
                  </div>
                ) : (
                  devices.map((device) => (
                    <div
                      key={device.device_code}
                      className="device-item"
                      onClick={() => handleDeviceSelect(device)}
                    >
                      <div className="device-info">
                        <div className="device-code-section">
                          <span className="device-code">{device.device_code}</span>
                          <span className="online-indicator">🟢 在线</span>
                        </div>
                        <div className="device-details">
                          <span className="device-id">设备ID: {device.device_id}</span>
                          <span className="last-connected">
                            最后连接: {device.last_connected_display}
                          </span>
                        </div>
                      </div>
                      <div className="device-actions">
                        <button className="select-btn">选择同步</button>
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
            💡 提示：选择一个在线设备开始同步数据库和图片
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceSelectionModal;
