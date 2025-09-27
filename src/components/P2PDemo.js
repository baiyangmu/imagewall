import React, { useState, useEffect } from 'react';
import peerService from '../services/PeerService';
import useDeviceId from '../hooks/useDeviceId';
import SyncManager from './SyncManager';

const P2PDemo = () => {
  const deviceId = useDeviceId();
  const [isInitialized, setIsInitialized] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [targetDeviceId, setTargetDeviceId] = useState('');
  const [status, setStatus] = useState('未连接');
  const [statusMessages, setStatusMessages] = useState([]);
  const [showSyncManager, setShowSyncManager] = useState(false);

  useEffect(() => {
    if (!deviceId) return;

    const initializePeer = async () => {
      try {
        setStatus('正在初始化...');
        await peerService.initialize(deviceId);
        setIsInitialized(true);
        setStatus('已连接');
        
        addStatusMessage(`P2P服务已启动，设备ID: ${deviceId}`);
        
        // 更新连接的设备列表
        updateConnectedDevices();
      } catch (error) {
        console.error('初始化P2P失败:', error);
        setStatus(`初始化失败: ${error.message}`);
        addStatusMessage(`初始化失败: ${error.message}`);
      }
    };

    initializePeer();

    // 设置连接状态处理器
    const removeConnectionHandler = peerService.onConnection((status, deviceId) => {
      if (status === 'connected') {
        addStatusMessage(`设备 ${deviceId} 已连接`);
      } else if (status === 'disconnected') {
        addStatusMessage(`设备 ${deviceId} 已断开连接`);
      }
      updateConnectedDevices();
    });

    return () => {
      removeConnectionHandler();
      peerService.destroy();
    };
  }, [deviceId]);

  const updateConnectedDevices = () => {
    setConnectedDevices(peerService.getConnectedDevices());
  };

  const addStatusMessage = (text) => {
    const newMessage = {
      id: Date.now() + Math.random(),
      text,
      timestamp: new Date().toLocaleTimeString()
    };
    setStatusMessages(prev => [...prev.slice(-4), newMessage]); // 只保留最后5条状态消息
  };

  const handleConnect = async () => {
    if (!targetDeviceId.trim()) {
      addStatusMessage('请输入目标设备ID');
      return;
    }

    try {
      setStatus('正在连接...');
      addStatusMessage(`正在连接到设备: ${targetDeviceId}`);
      
      await peerService.connectToDevice(targetDeviceId.trim());
      
      setStatus('已连接');
      addStatusMessage(`成功连接到设备: ${targetDeviceId}`);
      setTargetDeviceId('');
      updateConnectedDevices();
    } catch (error) {
      console.error('连接失败:', error);
      setStatus('连接失败');
      addStatusMessage(`连接失败: ${error.message}`);
    }
  };

  const handleDisconnect = (targetId) => {
    peerService.disconnectFromDevice(targetId);
    addStatusMessage(`已断开与设备 ${targetId} 的连接`);
    updateConnectedDevices();
  };

  // 简化的样式
  const containerStyle = {
    maxWidth: '1200px',
    width: '95%',
    margin: '10px auto',
    padding: '30px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#f9f9f9'
  };

  const headerStyle = {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#17a2b8',
    color: 'white',
    borderRadius: '6px',
    textAlign: 'center'
  };

  const sectionStyle = {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e9ecef'
  };

  const inputGroupStyle = {
    display: 'flex',
    gap: '15px',
    marginBottom: '15px',
    alignItems: 'center'
  };

  const inputStyle = {
    flex: 1,
    padding: '12px 16px',
    border: '1px solid #ccc',
    borderRadius: '6px',
    fontSize: '16px',
    minWidth: '200px'
  };

  const buttonStyle = {
    padding: '12px 20px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    whiteSpace: 'nowrap'
  };

  const deviceListStyle = {
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    border: '1px solid #e9ecef'
  };

  const statusMessagesStyle = {
    maxHeight: '180px',
    overflowY: 'auto',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    fontSize: '14px',
    border: '1px solid #e9ecef',
    lineHeight: '1.4'
  };

  return (
    <div style={containerStyle}>
      {/* 标题和状态 */}
      <div style={headerStyle}>
        <h3>📱 设备同步管理</h3>
        <div>当前设备ID: {deviceId || '加载中...'}</div>
        <div>连接状态: {status}</div>
      </div>

      {/* 连接设备 */}
      <div style={sectionStyle}>
        <h4 style={{marginTop: 0, marginBottom: '15px', color: '#333'}}>🔗 连接新设备</h4>
        <div style={inputGroupStyle}>
          <input
            type="text"
            placeholder="输入目标设备ID"
            value={targetDeviceId}
            onChange={(e) => setTargetDeviceId(e.target.value)}
            style={inputStyle}
            onKeyPress={(e) => e.key === 'Enter' && handleConnect()}
          />
          <button onClick={handleConnect} style={buttonStyle} disabled={!isInitialized}>
            连接设备
          </button>
        </div>
      </div>

      {/* 已连接的设备 */}
      {connectedDevices.length > 0 && (
        <div style={sectionStyle}>
          <h4 style={{marginTop: 0, marginBottom: '15px', color: '#333'}}>
            📡 已连接设备 ({connectedDevices.length})
          </h4>
          <div style={deviceListStyle}>
            {connectedDevices.map((deviceId, index) => (
              <div key={deviceId} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: index < connectedDevices.length - 1 ? '1px solid #e9ecef' : 'none'
              }}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                  <span style={{fontFamily: 'monospace', fontSize: '15px', fontWeight: '500'}}>{deviceId}</span>
                  <span style={{fontSize: '12px', color: '#666'}}>设备 {index + 1}</span>
                </div>
                <button 
                  onClick={() => handleDisconnect(deviceId)}
                  style={{...buttonStyle, backgroundColor: '#dc3545', fontSize: '12px', padding: '8px 12px'}}
                >
                  断开连接
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 状态消息 */}
      {statusMessages.length > 0 && (
        <div style={sectionStyle}>
          <h4 style={{marginTop: 0, marginBottom: '15px', color: '#333'}}>📝 状态消息</h4>
          <div style={statusMessagesStyle}>
            {statusMessages.map((msg, index) => (
              <div key={msg.id} style={{
                marginBottom: index < statusMessages.length - 1 ? '10px' : '0',
                fontSize: '13px',
                padding: '8px 12px',
                backgroundColor: 'white',
                borderRadius: '4px',
                border: '1px solid #e9ecef'
              }}>
                <span style={{color: '#17a2b8', fontWeight: '500'}}>[{msg.timestamp}]</span> 
                <span style={{marginLeft: '8px'}}>{msg.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 图库同步功能 */}
      {connectedDevices.length > 0 ? (
        <div style={sectionStyle}>
          <h4 style={{marginTop: 0, marginBottom: '15px', color: '#333'}}>📁 图库同步</h4>
          <div style={{marginBottom: '15px', fontSize: '14px', color: '#666'}}>
            将本设备的数据库(test2.db)和所有图片文件同步到已连接的设备
          </div>
          <button 
            onClick={() => setShowSyncManager(true)}
            style={{...buttonStyle, backgroundColor: '#28a745', padding: '12px 24px', fontSize: '16px'}}
          >
            🔄 开始图库同步
          </button>
        </div>
      ) : (
        <div style={sectionStyle}>
          <h4 style={{marginTop: 0, marginBottom: '15px', color: '#333'}}>📁 图库同步</h4>
          <div style={{fontSize: '14px', color: '#999', fontStyle: 'italic'}}>
            请先连接至少一个设备才能开始同步
          </div>
        </div>
      )}

      {/* 同步管理器 */}
      {showSyncManager && (
        <SyncManager 
          connectedDevices={connectedDevices}
          onClose={() => setShowSyncManager(false)}
        />
      )}

      {/* 使用说明 */}
      <div style={{...sectionStyle, backgroundColor: '#f8f9fa'}}>
        <h4 style={{marginTop: 0, marginBottom: '15px', color: '#333'}}>📖 使用说明</h4>
        <ul style={{margin: '0', paddingLeft: '20px', fontSize: '14px', color: '#666', lineHeight: '1.6'}}>
          <li>确保所有设备连接在同一WiFi网络下</li>
          <li>在目标设备上打开此页面，获取设备ID</li>
          <li>在此设备输入目标设备ID并点击"连接设备"</li>
          <li>连接成功后，可以开始图库同步</li>
          <li>同步将传输数据库文件和所有图片到目标设备</li>
        </ul>
      </div>
    </div>
  );
};

export default P2PDemo; 