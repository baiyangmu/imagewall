import React, { useState, useEffect } from 'react';
import peerService from '../services/PeerService';
import useDeviceCode from '../hooks/useDeviceCode';
import Modal from 'react-modal';
import SyncManager from './SyncManager';

// 设置Modal的应用根元素
if (typeof document !== 'undefined') {
  Modal.setAppElement('#root');
}

const P2PDemo = ({ isModalMode = false, isOpen = false, onRequestClose }) => {
  const deviceCode = useDeviceCode();
  const [isInitialized, setIsInitialized] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [targetDeviceCode, setTargetDeviceCode] = useState('');
  const [status, setStatus] = useState('未连接');
  const [showP2PModal, setShowP2PModal] = useState(false);

  useEffect(() => {
    if (!deviceCode) return;

    const initializePeer = async () => {
      try {
        setStatus('正在初始化...');
        await peerService.initialize(deviceCode);
        setIsInitialized(true);
        setStatus('已连接');
        
        
        // 更新连接的设备列表
        updateConnectedDevices();
      } catch (error) {
        console.error('初始化P2P失败:', error);
        setStatus(`初始化失败: ${error.message}`);
      }
    };

    initializePeer();

    // 设置连接状态处理器
    const removeConnectionHandler = peerService.onConnection((status, connectedDeviceCode) => {
      updateConnectedDevices();
    });

    return () => {
      removeConnectionHandler();
      peerService.destroy();
    };
  }, [deviceCode]);

  const updateConnectedDevices = () => {
    setConnectedDevices(peerService.getConnectedDevices());
  };


  const handleConnect = async () => {
    if (!targetDeviceCode.trim()) {
      return;
    }

    // 验证6位数字格式
    if (!/^\d{6}$/.test(targetDeviceCode.trim())) {
      return;
    }

    try {
      setStatus('正在连接...');
      
      await peerService.connectToDevice(targetDeviceCode.trim());
      
      setStatus('已连接');
      setTargetDeviceCode('');
      updateConnectedDevices();
    } catch (error) {
      console.error('连接失败:', error);
      setStatus('连接失败');
    }
  };

  const handleDisconnect = (targetCode) => {
    peerService.disconnectFromDevice(targetCode);
    updateConnectedDevices();
  };

  // 处理同步按钮点击 - 直接打开P2P通信模态框
  const handleSyncClick = () => {
    setShowP2PModal(true);
  };

  // 关闭P2P通信模态框
  const handleP2PModalClose = () => {
    setShowP2PModal(false);
    
    // 如果是模态框模式（从App.js调用），关闭时刷新页面
    if (onRequestClose) {
      onRequestClose();
      // 延迟刷新，确保模态框完全关闭
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
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


  // 模态框关闭处理（自动刷新页面）
  const handleModalClose = () => {
    if (onRequestClose) {
      onRequestClose();
      // 延迟刷新，确保模态框完全关闭
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  };

  // 如果是模态框模式，直接返回模态框
  if (isModalMode) {
    return (
      <Modal 
        isOpen={isOpen} 
        onRequestClose={handleModalClose}
        style={{
          overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000
          },
          content: {
            position: 'relative',
            top: '50%',
            left: '50%',
            right: 'auto',
            bottom: 'auto',
            marginRight: '-50%',
            transform: 'translate(-50%, -50%)',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '90vh',
            padding: '0',
            border: 'none',
            borderRadius: '12px',
            backgroundColor: 'white',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)'
          }
        }}
        contentLabel="P2P设备同步"
      >
        <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
          <div style={{
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid #e9ecef',
            backgroundColor: '#f8f9fa'
          }}>
            <h3 style={{margin: 0, color: '#333', fontSize: '18px', fontWeight: '600'}}>设备同步</h3>
            <button 
              onClick={handleModalClose} 
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                color: '#666',
                cursor: 'pointer',
                padding: '4px',
                lineHeight: 1,
                borderRadius: '4px'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#f5f5f5'}
              onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              ✕
            </button>
          </div>
          <div style={{
            flex: 1,
            padding: '24px',
            overflowY: 'auto'
          }}>
            <P2PInnerContent 
              deviceCode={deviceCode}
              isInitialized={isInitialized}
              connectedDevices={connectedDevices}
              targetDeviceCode={targetDeviceCode}
              setTargetDeviceCode={setTargetDeviceCode}
              status={status}
              handleConnect={handleConnect}
              handleDisconnect={handleDisconnect}
            />
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <div style={containerStyle}>
      {/* 标题和状态 */}
      <div style={headerStyle}>
        <h3>📱 设备同步管理</h3>
        <div>当前设备代码: {deviceCode || '加载中...'}</div>
        <div>连接状态: {status}</div>
      </div>

      {/* 连接设备 */}
      <div style={sectionStyle}>
        <h4 style={{marginTop: 0, marginBottom: '15px', color: '#333'}}>🔗 连接新设备</h4>
        <div style={inputGroupStyle}>
          <input
            type="text"
            placeholder="输入6位设备代码 (如: 123456)"
            value={targetDeviceCode}
            onChange={(e) => setTargetDeviceCode(e.target.value)}
            style={inputStyle}
            maxLength={6}
            pattern="[0-9]{6}"
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
            {connectedDevices.map((deviceCode, index) => (
              <div key={deviceCode} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: index < connectedDevices.length - 1 ? '1px solid #e9ecef' : 'none'
              }}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                  <span style={{fontFamily: 'monospace', fontSize: '18px', fontWeight: '600', color: '#007bff'}}>{deviceCode}</span>
                  <span style={{fontSize: '12px', color: '#666'}}>设备 {index + 1}</span>
                </div>
                <button 
                  onClick={() => handleDisconnect(deviceCode)}
                  style={{...buttonStyle, backgroundColor: '#dc3545', fontSize: '12px', padding: '8px 12px'}}
                >
                  断开连接
                </button>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* 图库同步功能 - 直接进入P2P通信 */}
        <div style={sectionStyle}>
          <h4 style={{marginTop: 0, marginBottom: '15px', color: '#333'}}>📁 图库同步</h4>
          <div style={{marginBottom: '15px', fontSize: '14px', color: '#666'}}>
          通过P2P连接进行设备同步，传输数据库和图片文件
          </div>
          <button 
          onClick={handleSyncClick}
            style={{...buttonStyle, backgroundColor: '#28a745', padding: '12px 24px', fontSize: '16px'}}
          >
          🔄 开始同步
        </button>
      </div>

      {/* P2P通信模态框 */}
      <Modal 
        isOpen={showP2PModal} 
        onRequestClose={handleP2PModalClose}
        style={{
          overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000
          },
          content: {
            position: 'relative',
            top: '50%',
            left: '50%',
            right: 'auto',
            bottom: 'auto',
            marginRight: '-50%',
            transform: 'translate(-50%, -50%)',
            width: '90%',
            maxWidth: '700px',
            maxHeight: '90vh',
            padding: '0',
            border: 'none',
            borderRadius: '12px',
            backgroundColor: 'white',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)'
          }
        }}
        contentLabel="P2P设备同步"
      >
        <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
          <div style={{
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid #e9ecef',
            backgroundColor: '#f8f9fa'
          }}>
            <h3 style={{margin: 0, color: '#333', fontSize: '18px', fontWeight: '600'}}>P2P设备同步</h3>
            <button 
              onClick={handleP2PModalClose} 
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                color: '#666',
                cursor: 'pointer',
                padding: '4px',
                lineHeight: 1,
                borderRadius: '4px'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#f5f5f5'}
              onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              ✕
          </button>
        </div>
          <div style={{
            flex: 1,
            overflowY: 'auto'
          }}>
            {connectedDevices.length > 0 ? (
              <SyncManager 
                connectedDevices={connectedDevices}
                onClose={handleP2PModalClose}
              />
            ) : (
              <div style={{padding: '24px'}}>
                <P2PInnerContent 
                  deviceCode={deviceCode}
                  isInitialized={isInitialized}
                  connectedDevices={connectedDevices}
                  targetDeviceCode={targetDeviceCode}
                  setTargetDeviceCode={setTargetDeviceCode}
                  status={status}
                  handleConnect={handleConnect}
                  handleDisconnect={handleDisconnect}
                />
              </div>
            )}
          </div>
        </div>
      </Modal>

    </div>
  );
};

// 简化的P2P同步组件
const P2PInnerContent = ({ 
  deviceCode, 
  isInitialized, 
  connectedDevices, 
  targetDeviceCode, 
  setTargetDeviceCode, 
  status,
  handleConnect, 
  handleDisconnect
}) => {
  const [syncProgress, setSyncProgress] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [syncPhase, setSyncPhase] = useState('');
  const [syncDetails, setSyncDetails] = useState('');

  // 监听连接状态变化
  useEffect(() => {
    setIsConnected(connectedDevices.length > 0);
  }, [connectedDevices]);

  // 监听同步进度
  useEffect(() => {
    const removeHandler = peerService.onSyncProgress((progress) => {
      console.log('收到同步进度:', progress);
      
      switch (progress.type) {
        // 只处理发送方进度，暂时隐藏接收方进度
        case 'db_start':
          setSyncPhase('正在发送数据库...');
          setSyncProgress(10);
          setSyncDetails('');
          break;
        case 'db_complete':
          setSyncPhase('数据库发送完成');
          setSyncProgress(30);
          break;
        case 'images_start':
          setSyncPhase('正在发送图片...');
          setSyncProgress(35);
          setSyncDetails(`共 ${progress.data.totalImages} 张图片`);
          break;
        case 'image_progress':
          const imageProgress = 35 + (progress.data.current / progress.data.total) * 60; // 35-95%
          setSyncProgress(Math.round(imageProgress));
          setSyncDetails(`发送进度: ${progress.data.current} / ${progress.data.total} 张图片`);
          break;
        case 'images_complete':
          setSyncPhase('图片发送完成');
          setSyncProgress(95);
          break;
        case 'sync_complete':
          setSyncPhase('同步完成！');
          setSyncProgress(100);
          setSyncDetails('所有文件已成功传输');
          break;
        case 'sync_error':
          setSyncPhase('同步失败');
          setSyncProgress(null);
          setSyncDetails(progress.data.error || '未知错误');
          break;
        // 接收方进度暂时隐藏（注释掉）
        // case 'receive_start':
        // case 'receive_progress':
        // case 'receive_complete':
        // case 'db_save_start':
        // case 'db_save_complete':
        // case 'image_save_start':
        // case 'image_save_complete':
        default:
          // 忽略接收方的进度事件
          console.log('忽略进度事件:', progress.type);
          break;
      }
    });

    return removeHandler;
  }, []);

  const containerStyle = {
    maxWidth: '500px',
    width: '100%',
    margin: '0 auto',
    padding: '0'
  };

  const cardStyle = {
    padding: '24px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
    textAlign: 'center'
  };

  const deviceCodeStyle = {
    fontFamily: 'monospace',
    fontSize: '32px',
    fontWeight: '700',
    color: '#007bff',
    letterSpacing: '4px',
    marginBottom: '8px'
  };

  const inputStyle = {
    width: '200px',
    padding: '12px 16px',
    border: '2px solid #ddd',
    borderRadius: '8px',
    fontSize: '18px',
    textAlign: 'center',
    fontFamily: 'monospace',
    letterSpacing: '2px',
    marginRight: '12px'
  };

  const buttonStyle = {
    padding: '12px 24px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500'
  };

  const syncButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#28a745',
    fontSize: '18px',
    padding: '16px 32px',
    marginTop: '16px'
  };

  const progressBarStyle = {
    width: '100%',
    height: '8px',
    backgroundColor: '#e9ecef',
    borderRadius: '4px',
    marginTop: '16px',
    overflow: 'hidden'
  };

  const progressFillStyle = {
    height: '100%',
    backgroundColor: '#28a745',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
    width: syncProgress ? `${syncProgress}%` : '0%'
  };

  const handleStartSync = async () => {
    if (!connectedDevices || connectedDevices.length === 0) {
      console.error('没有连接的设备');
      return;
    }

    try {
      setSyncProgress(0);
      
      // 使用第一个连接的设备开始同步
      const targetDevice = connectedDevices[0];
      console.log('开始同步到设备:', targetDevice);
      
      await peerService.startSync(targetDevice);
    } catch (error) {
      console.error('开始同步失败:', error);
      setSyncProgress(null);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* 1. 显示当前设备码 */}
        <h4 style={{marginTop: 0, marginBottom: '16px', color: '#333'}}>📱 当前设备码</h4>
        <div style={deviceCodeStyle}>{deviceCode || '------'}</div>
        <div style={{fontSize: '14px', color: '#666', marginBottom: '32px'}}>
          其他设备使用此代码连接
        </div>

        {/* 2. 连接设备输入框 */}
        {!isConnected && (
          <>
            <h4 style={{marginBottom: '16px', color: '#333'}}>🔗 连接目标设备</h4>
            <div style={{marginBottom: '24px'}}>
              <input
                type="text"
                placeholder="123456"
                value={targetDeviceCode}
                onChange={(e) => setTargetDeviceCode(e.target.value)}
                style={inputStyle}
                maxLength={6}
                pattern="[0-9]{6}"
                onKeyPress={(e) => e.key === 'Enter' && handleConnect()}
              />
              <button 
                onClick={handleConnect} 
                style={buttonStyle} 
                disabled={!isInitialized || targetDeviceCode.length !== 6}
              >
                连接
              </button>
            </div>
          </>
        )}

        {/* 3. 连接成功后显示同步功能 */}
        {isConnected && (
          <>
            <div style={{
              padding: '12px',
              backgroundColor: '#d4edda',
              border: '1px solid #c3e6cb',
              borderRadius: '6px',
              color: '#155724',
              marginBottom: '24px'
            }}>
              ✅ 已连接到设备: {connectedDevices.join(', ')}
            </div>

            <button 
              onClick={handleStartSync}
              style={syncButtonStyle}
              disabled={syncProgress !== null && syncProgress < 100}
            >
              🔄 开始同步
            </button>

            {/* 进度条 */}
            {syncProgress !== null && (
              <div style={{marginTop: '24px'}}>
                <div style={{marginBottom: '8px', fontSize: '14px', color: '#666'}}>
                  {syncPhase} {syncProgress}%
                </div>
                <div style={progressBarStyle}>
                  <div style={progressFillStyle}></div>
                </div>
                {syncDetails && (
                  <div style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: '#666'
                  }}>
                    {syncDetails}
                  </div>
                )}
                {syncProgress === 100 && (
                  <div style={{
                    marginTop: '12px',
                    color: '#28a745',
                    fontWeight: '500'
                  }}>
                    ✅ 同步完成！
                  </div>
                )}
              </div>
            )}

            <div style={{marginTop: '16px'}}>
              <button 
                onClick={() => {
                  connectedDevices.forEach(deviceCode => handleDisconnect(deviceCode));
                  // 重置同步状态
                  setSyncProgress(null);
                  setSyncPhase('');
                  setSyncDetails('');
                }}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#6c757d',
                  fontSize: '14px',
                  padding: '8px 16px'
                }}
              >
                断开连接
              </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default P2PDemo; 