import React, { useState, useEffect } from 'react';
import peerService from '../services/PeerService';
import './SyncManager.css';

const SyncManager = ({ connectedDevices, onClose }) => {
  const [syncStatus, setSyncStatus] = useState('idle'); // idle, syncing, completed, error
  const [syncProgress, setSyncProgress] = useState({});
  const [logs, setLogs] = useState([]);
  // 移除 syncMode 状态，因为现在用两个独立按钮
  
  // 自动使用第一个连接的设备
  const targetDevice = connectedDevices && connectedDevices.length > 0 ? connectedDevices[0] : null;

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
        case 'db_merge_start':
          setSyncStatus('syncing');
          setSyncProgress({ phase: '数据库合并', progress: 10 });
          break;
        case 'db_merge_complete':
          setSyncProgress({ 
            phase: '数据库合并完成', 
            progress: 100,
            stats: progress.data.stats
          });
          break;
        case 'db_merge_failed':
          setSyncProgress({ 
            phase: '合并失败，使用覆盖策略', 
            progress: 50,
            error: progress.data.error 
          });
          break;
        case 'db_create_start':
          setSyncProgress({ phase: '创建新数据库', progress: 80 });
          break;
        case 'db_create_complete':
          setSyncProgress({ phase: '数据库创建完成', progress: 100 });
          break;
        case 'db_fallback_backup':
          setSyncProgress({ 
            phase: '已备份现有数据，准备覆盖', 
            progress: 60 
          });
          break;
        case 'db_overwrite_complete':
          setSyncProgress({ 
            phase: '数据库覆盖完成', 
            progress: 100 
          });
          break;
        
        // 双向同步进度处理
        case 'phase1_start':
          setSyncStatus('syncing');
          setSyncProgress({ 
            phase: '阶段1：拉取对方数据', 
            progress: 10,
            syncId: progress.data.syncId
          });
          break;
        case 'phase1_receive_start':
          setSyncProgress({ 
            phase: '阶段1：接收对方请求', 
            progress: 20,
            syncId: progress.data.syncId
          });
          break;
        case 'phase1_complete':
          setSyncProgress({ 
            phase: '阶段1完成', 
            progress: 50,
            syncId: progress.data.syncId
          });
          break;
        case 'phase2_start':
          setSyncProgress({ 
            phase: '阶段2：通知对方拉取', 
            progress: 60,
            syncId: progress.data.syncId
          });
          break;
        case 'phase2_receive_start':
          setSyncProgress({ 
            phase: '阶段2：拉取合并结果', 
            progress: 70,
            syncId: progress.data.syncId
          });
          break;
        case 'db_phase2_overwrite_start':
          setSyncProgress({ 
            phase: '阶段2：接收对方合并结果', 
            progress: 80,
            syncId: progress.data.syncId
          });
          break;
        case 'db_phase2_overwrite_complete':
          setSyncProgress({ 
            phase: '阶段2：合并结果已应用', 
            progress: 90,
            syncId: progress.data.syncId
          });
          break;
        case 'bidirectional_sync_complete':
          setSyncStatus('completed');
          setSyncProgress({ 
            phase: '双向同步完成', 
            progress: 100,
            syncId: progress.data.syncId,
            stats: progress.data.stats
          });
          break;
        case 'bidirectional_sync_error':
          setSyncStatus('error');
          setSyncProgress({ 
            phase: '双向同步失败', 
            error: progress.data.error,
            syncId: progress.data.syncId
          });
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

  // 移除自动同步，让用户主动选择同步模式和启动同步
  // useEffect(() => {
  //   if (targetDevice && syncStatus === 'idle') {
  //     handleStartSync();
  //   }
  // }, [targetDevice, syncStatus]);

  const addLog = (message) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // 单向同步处理函数
  const handleStartUnidirectionalSync = async () => {
    if (!targetDevice) {
      console.error('没有可用的目标设备');
      setSyncStatus('error');
      addLog('同步失败: 没有可用的目标设备');
      return;
    }

    try {
      setSyncStatus('syncing');
      setLogs([]);
      addLog(`开始单向同步到设备: ${targetDevice}`);
      await peerService.startSync(targetDevice);
    } catch (error) {
      console.error('开始单向同步失败:', error);
      setSyncStatus('error');
      addLog(`单向同步失败: ${error.message}`);
    }
  };

  // 双向同步处理函数
  const handleStartBidirectionalSync = async () => {
    if (!targetDevice) {
      console.error('没有可用的目标设备');
      setSyncStatus('error');
      addLog('同步失败: 没有可用的目标设备');
      return;
    }

    try {
      setSyncStatus('syncing');
      setLogs([]);
      addLog(`开始双向同步到设备: ${targetDevice}`);
      await peerService.startBidirectionalSync(targetDevice);
    } catch (error) {
      console.error('开始双向同步失败:', error);
      setSyncStatus('error');
      addLog(`双向同步失败: ${error.message}`);
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
        <div className="target-device-info">
          <div style={{marginBottom: '15px', fontSize: '14px', color: '#666'}}>
            同步目标设备: <strong style={{color: '#007bff', fontFamily: 'monospace'}}>{targetDevice || '无'}</strong>
          </div>
        </div>

        <div className="sync-controls">
          {syncStatus === 'idle' && targetDevice && (
            <div className="sync-buttons">
              <button 
                onClick={handleStartUnidirectionalSync}
                className="sync-btn unidirectional-btn"
              >
                📥 单向同步
                <small>（仅将对方数据同步到本设备）</small>
              </button>
              <button 
                onClick={handleStartBidirectionalSync}
                className="sync-btn bidirectional-btn"
              >
                🔄 双向同步
                <small>（两台设备互相同步数据）</small>
              </button>
            </div>
          )}
          
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

            {syncProgress.syncId && (
              <div className="sync-id-info">
                <small>同步ID: {syncProgress.syncId}</small>
              </div>
            )}

            {syncProgress.error && (
              <div className="error-message">
                错误: {syncProgress.error}
              </div>
            )}

            {syncProgress.syncId && syncStatus === 'syncing' && (
              <div className="bidirectional-info">
                <h4>🔄 双向同步流程</h4>
                <div className="phase-indicators">
                  <div className={`phase-indicator ${syncProgress.phase && syncProgress.phase.includes('阶段1') ? 'active' : 'completed'}`}>
                    <span className="phase-number">1</span>
                    <span className="phase-text">拉取对方数据</span>
                  </div>
                  <div className="phase-arrow">→</div>
                  <div className={`phase-indicator ${syncProgress.phase && syncProgress.phase.includes('阶段2') ? 'active' : syncProgress.progress > 50 ? 'completed' : 'pending'}`}>
                    <span className="phase-number">2</span>
                    <span className="phase-text">对方拉取合并结果</span>
                  </div>
                </div>
              </div>
            )}

            {syncProgress.stats && (
              <div className="merge-summary">
                <h4>📊 {syncProgress.syncId ? '双向同步' : '数据合并'}统计</h4>
                <div className="merge-stats">
                  <div className="stat-item">
                    <span className="stat-label">新增图片:</span>
                    <span className="stat-value">{syncProgress.stats.imagesAdded || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">新增设备:</span>
                    <span className="stat-value">{syncProgress.stats.devicesAdded || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">跳过重复:</span>
                    <span className="stat-value">{syncProgress.stats.duplicatesSkipped || 0}</span>
                  </div>
                </div>
                {syncProgress.stats.totalDuration && (
                  <div className="sync-duration">
                    <small>总耗时: {Math.round(syncProgress.stats.totalDuration / 1000)}秒</small>
                  </div>
                )}
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

      </div>
    </div>
  );
};

export default SyncManager; 