import React, { useState, useEffect } from 'react';
import peerService from '../services/PeerService';
import './SyncManager.css';

const SyncManager = ({ connectedDevices, onClose }) => {
  const [syncStatus, setSyncStatus] = useState('idle'); // idle, syncing, completed, error
  const [syncProgress, setSyncProgress] = useState({});
  const [selectedDevice, setSelectedDevice] = useState('');
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const removeHandler = peerService.onSyncProgress((progress) => {
      addLog(`${progress.type}: ${JSON.stringify(progress.data)}`);
      
      switch (progress.type) {
        case 'db_start':
          setSyncStatus('syncing');
          setSyncProgress({ phase: '数据库传输', progress: 0 });
          break;
        case 'db_complete':
          setSyncProgress({ phase: '数据库传输', progress: 100 });
          break;
        case 'images_start':
          setSyncProgress({ 
            phase: '图片传输', 
            progress: 0, 
            total: progress.data.totalImages 
          });
          break;
        case 'image_progress':
          setSyncProgress({
            phase: '图片传输',
            progress: (progress.data.current / progress.data.total) * 100,
            current: progress.data.current,
            total: progress.data.total
          });
          break;
        case 'images_complete':
          setSyncProgress({ phase: '图片传输完成', progress: 100 });
          break;
        case 'sync_complete':
          setSyncStatus('completed');
          setSyncProgress({ phase: '同步完成', progress: 100 });
          break;
        case 'sync_error':
          setSyncStatus('error');
          setSyncProgress({ phase: '同步失败', error: progress.data.error });
          break;
        case 'receive_start':
          setSyncStatus('syncing');
          setSyncProgress({ 
            phase: `接收${progress.data.fileType === 'database' ? '数据库' : '图片'}文件`, 
            progress: 0,
            fileName: progress.data.fileName
          });
          break;
        case 'receive_progress':
          setSyncProgress(prev => ({
            ...prev,
            progress: progress.data.progress
          }));
          break;
        case 'receive_complete':
          addLog(`文件接收完成: ${progress.data.fileName}`);
          break;
      }
    });

    return removeHandler;
  }, []);

  const addLog = (message) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const handleStartSync = async () => {
    if (!selectedDevice) {
      alert('请选择目标设备');
      return;
    }

    try {
      setSyncStatus('syncing');
      setLogs([]);
      addLog('开始同步...');
      
      await peerService.startSync(selectedDevice);
    } catch (error) {
      console.error('开始同步失败:', error);
      setSyncStatus('error');
      addLog(`同步失败: ${error.message}`);
    }
  };

  const handleReset = () => {
    setSyncStatus('idle');
    setSyncProgress({});
    setLogs([]);
  };

  return (
    <div className="sync-manager">
      <div className="sync-header">
        <h3>图库同步</h3>
        <button onClick={onClose} className="close-btn">×</button>
      </div>

      <div className="sync-body">
        <div className="device-selection">
          <label>选择目标设备:</label>
          <select 
            value={selectedDevice} 
            onChange={(e) => setSelectedDevice(e.target.value)}
            disabled={syncStatus === 'syncing'}
          >
            <option value="">请选择设备</option>
            {connectedDevices.map(deviceId => (
              <option key={deviceId} value={deviceId}>
                {deviceId.slice(0, 8)}...
              </option>
            ))}
          </select>
        </div>

        <div className="sync-controls">
          <button 
            onClick={handleStartSync}
            disabled={!selectedDevice || syncStatus === 'syncing'}
            className="start-sync-btn"
          >
            {syncStatus === 'syncing' ? '同步中...' : '开始同步'}
          </button>
          
          {syncStatus !== 'idle' && syncStatus !== 'syncing' && (
            <button 
              onClick={handleReset}
              className="reset-btn"
            >
              重新开始
            </button>
          )}
        </div>

        {syncStatus !== 'idle' && (
          <div className="sync-progress">
            <div className="progress-info">
              <span>{syncProgress.phase}</span>
              {syncProgress.progress !== undefined && (
                <span>{Math.round(syncProgress.progress)}%</span>
              )}
            </div>
            
            {syncProgress.progress !== undefined && (
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${syncProgress.progress}%` }}
                />
              </div>
            )}
            
            {syncProgress.current && syncProgress.total && (
              <div className="progress-details">
                {syncProgress.current} / {syncProgress.total} 张图片
              </div>
            )}

            {syncProgress.fileName && (
              <div className="file-name">
                文件: {syncProgress.fileName}
              </div>
            )}

            {syncProgress.error && (
              <div className="error-message">
                错误: {syncProgress.error}
              </div>
            )}
          </div>
        )}

        <div className="sync-logs">
          <h4>同步日志</h4>
          <div className="logs-container">
            {logs.map((log, index) => (
              <div key={index} className="log-entry">{log}</div>
            ))}
          </div>
        </div>

        <div className="sync-instructions">
          <h4>使用说明</h4>
          <ul>
            <li>🔗 首先确保两个设备已建立P2P连接</li>
            <li>📁 选择目标设备，点击"开始同步"</li>
            <li>🗄️ 系统会先传输数据库文件(test2.db)</li>
            <li>🖼️ 然后逐个传输所有图片文件</li>
            <li>🔄 接收完成后会询问是否刷新页面应用更改</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SyncManager; 