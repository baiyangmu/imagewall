import React, { useState, useEffect } from 'react';
import peerService from '../services/PeerService';
import useDeviceCode from '../hooks/useDeviceCode';
import Modal from 'react-modal';
import SyncManager from './SyncManager';
import DeviceSelectionModal from './DeviceSelectionModal';
import DeviceService from '../services/DeviceService';
import StorageStatus from './StorageStatus';

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
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showDeviceSelection, setShowDeviceSelection] = useState(false);
  const [showSyncManager, setShowSyncManager] = useState(false);
  const [historyDevices, setHistoryDevices] = useState([]);

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

  // 加载历史设备（排除当前设备）
  useEffect(() => {
    const loadHistoryDevices = async () => {
      try {
        const deviceCodes = await DeviceService.getConnectedDeviceCodes();
        // 排除当前设备码
        const filteredDevices = deviceCodes.filter(code => code !== deviceCode);
        setHistoryDevices(filteredDevices);
      } catch (error) {
        console.error('加载历史设备失败:', error);
      }
    };

    if ((isOpen || !isModalMode) && deviceCode) {
      loadHistoryDevices();
    }
  }, [isOpen, isModalMode, deviceCode]);

  const updateConnectedDevices = () => {
    setConnectedDevices(peerService.getConnectedDevices());
  };

  const handleConnect = async (deviceCodeParam = null) => {
    const codeToConnect = deviceCodeParam || targetDeviceCode.trim();

    if (!codeToConnect) {
      alert('请输入设备代码或选择历史设备');
      return;
    }

    // 验证6位数字格式
    if (!/^\d{6}$/.test(codeToConnect)) {
      alert('设备代码必须是6位数字');
      return;
    }

    try {
      setStatus('正在连接...');
      
      await peerService.connectToDevice(codeToConnect);
      
      setStatus('已连接');
      setTargetDeviceCode('');
      updateConnectedDevices();
    } catch (error) {
      console.error('连接失败:', error);
      setStatus(`连接失败: ${error.message}`);
      alert(`连接失败: ${error.message}`);
    }
  };

  const handleDisconnect = (targetCode) => {
    peerService.disconnectFromDevice(targetCode);
    updateConnectedDevices();
  };

  // 处理同步按钮点击 - 先显示设备选择弹窗
  const handleSyncClick = () => {
    setShowDeviceSelection(true);
  };

  // 处理设备选择
  const handleDeviceSelect = async (device) => {
    setSelectedDevice(device);
    setShowDeviceSelection(false);
    
    // 如果选择的是在线设备，直接开始同步
    if (device.is_online) {
      setShowSyncManager(true);
    } else {
      // 如果是历史设备，只连接，不自动开始同步
      try {
        setStatus('正在连接...');
        await handleConnect(device.device_code);
        // 连接成功，但不自动打开同步管理器
        // 用户可以稍后手动点击"开始同步"
      } catch (error) {
        console.error('连接设备失败:', error);
        setStatus(`连接失败: ${error.message}`);
      }
    }
  };

  // 关闭设备选择弹窗
  const handleDeviceSelectionClose = () => {
    setShowDeviceSelection(false);
  };

  // 关闭同步管理器
  const handleSyncManagerClose = () => {
    setShowSyncManager(false);
    setSelectedDevice(null);
    
    // 如果是模态框模式（从App.js调用），关闭时刷新页面
    if (onRequestClose) {
      onRequestClose();
      // 延迟刷新，确保模态框完全关闭
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
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

  // 优化的样式
  const containerStyle = {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '24px',
    maxWidth: '600px',
    margin: '0 auto',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    minHeight: '100vh'
  };

  const headerStyle = {
    textAlign: 'center',
    marginBottom: '32px',
    padding: '24px',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: '16px',
    border: 'none',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
    backdropFilter: 'blur(10px)'
  };

  const sectionStyle = {
    marginBottom: '24px',
    padding: '24px',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: '16px',
    border: 'none',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
    backdropFilter: 'blur(10px)'
  };

  const deviceCardStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 20px',
    margin: '8px',
    backgroundColor: '#4285f4',
    color: 'white',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    minWidth: '100px',
    boxShadow: '0 4px 16px rgba(66, 133, 244, 0.3)',
    fontSize: '16px',
    fontWeight: '500'
  };

  const inputStyle = {
    width: '100%',
    padding: '16px 20px',
    border: '2px solid #e8eaed',
    borderRadius: '12px',
    fontSize: '18px',
    fontFamily: 'monospace',
    textAlign: 'center',
    letterSpacing: '2px',
    backgroundColor: 'white',
    transition: 'border-color 0.3s ease',
    marginBottom: '16px'
  };

  const buttonStyle = {
    padding: '16px 32px',
    backgroundColor: '#4285f4',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 16px rgba(66, 133, 244, 0.3)',
    width: '100%'
  };

  // 如果是模态框模式，渲染模态框
  if (isModalMode) {
    return (
      <Modal 
        isOpen={isOpen} 
        onRequestClose={handleP2PModalClose}
        style={{
          overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
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
            borderRadius: '16px',
            backgroundColor: 'white',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)'
          }
        }}
        contentLabel="P2P设备同步"
      >
        <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
          <div style={{
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '24px 32px',
            borderBottom: '1px solid #e8eaed'
          }}>
            <h3 style={{margin: 0, color: '#333', fontSize: '20px', fontWeight: '600'}}>📱 设备同步</h3>
            <button 
              onClick={handleP2PModalClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                color: '#666',
                cursor: 'pointer',
                padding: '8px',
                lineHeight: 1,
                borderRadius: '8px',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#f1f3f4'}
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
              <div style={{padding: '32px'}}>
            <P2PInnerContent 
              deviceCode={deviceCode}
              isInitialized={isInitialized}
              connectedDevices={connectedDevices}
              targetDeviceCode={targetDeviceCode}
              setTargetDeviceCode={setTargetDeviceCode}
              status={status}
              handleConnect={handleConnect}
              handleDisconnect={handleDisconnect}
                  historyDevices={historyDevices}
            />
              </div>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <div style={containerStyle}>
      {/* 标题和状态 */}
      <div style={headerStyle}>
        <h2 style={{margin: '0 0 16px 0', color: '#333', fontSize: '24px', fontWeight: '700'}}>📱 设备同步管理</h2>
        <div style={{fontSize: '16px', color: '#5f6368', marginBottom: '8px'}}>
          当前设备代码: <span style={{fontFamily: 'monospace', fontSize: '18px', fontWeight: '600', color: '#4285f4'}}>{deviceCode || '加载中...'}</span>
        </div>
        <div style={{fontSize: '14px', color: connectedDevices.length > 0 ? '#137333' : '#ea4335', fontWeight: '500'}}>
          连接状态: {status}
        </div>
      </div>

      {/* 连接设备 */}
      <div style={sectionStyle}>
        <h3 style={{marginTop: 0, marginBottom: '24px', color: '#333', fontSize: '18px', fontWeight: '600'}}>🔗 设备连接</h3>
        
        {/* 历史设备卡片 */}
        {historyDevices.length > 0 && (
          <div style={{marginBottom: '32px'}}>
            <h4 style={{margin: '0 0 16px 0', color: '#5f6368', fontSize: '14px', fontWeight: '500', textAlign: 'center'}}>
              历史连接设备
            </h4>
                         <div style={{
               display: 'flex',
               flexWrap: 'wrap',
               justifyContent: 'center',
               gap: '12px',
               marginBottom: '24px'
             }}>
               {historyDevices.map((code) => (
                 <button
                   key={code}
                   onClick={() => handleConnect(code)}
                   style={{
                     ...deviceCardStyle,
                     opacity: isInitialized ? 1 : 0.5
                   }}
                   disabled={!isInitialized}
                   onMouseOver={(e) => {
                     if (isInitialized) {
                       e.target.style.backgroundColor = '#3367d6';
                       e.target.style.transform = 'translateY(-2px)';
                       e.target.style.boxShadow = '0 6px 20px rgba(66, 133, 244, 0.4)';
                     }
                   }}
                   onMouseOut={(e) => {
                     e.target.style.backgroundColor = '#4285f4';
                     e.target.style.transform = 'translateY(0px)';
                     e.target.style.boxShadow = '0 4px 16px rgba(66, 133, 244, 0.3)';
                   }}
                 >
                   <div style={{fontFamily: 'monospace', fontSize: '18px', fontWeight: '600'}}>{code}</div>
                 </button>
               ))}
            </div>
            <div style={{textAlign: 'center', color: '#5f6368', fontSize: '12px', marginBottom: '24px'}}>
              或者手动输入设备代码
            </div>
          </div>
        )}

        {/* 手动输入区域 */}
        <div style={{textAlign: 'center'}}>
          <input
            type="text"
            placeholder="请输入6位设备代码"
            value={targetDeviceCode}
            onChange={(e) => setTargetDeviceCode(e.target.value)}
            style={{
              ...inputStyle,
              borderColor: targetDeviceCode ? '#4285f4' : '#e8eaed'
            }}
            maxLength={6}
            pattern="[0-9]{6}"
            onKeyPress={(e) => e.key === 'Enter' && handleConnect()}
            onFocus={(e) => e.target.style.borderColor = '#4285f4'}
            onBlur={(e) => e.target.style.borderColor = targetDeviceCode ? '#4285f4' : '#e8eaed'}
          />
          <button 
            onClick={() => handleConnect()} 
            style={{
              ...buttonStyle,
              opacity: isInitialized ? 1 : 0.5
            }}
            disabled={!isInitialized}
            onMouseOver={(e) => {
              if (isInitialized) {
                e.target.style.backgroundColor = '#3367d6';
                e.target.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#4285f4';
              e.target.style.transform = 'translateY(0px)';
            }}
          >
            {isInitialized ? '连接设备' : '初始化中...'}
          </button>
        </div>
      </div>

      {/* 已连接的设备 */}
      {connectedDevices.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={{marginTop: 0, marginBottom: '20px', color: '#333', fontSize: '18px', fontWeight: '600'}}>
            📡 已连接设备 ({connectedDevices.length})
          </h3>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: '12px'}}>
            {connectedDevices.map((deviceCode) => (
              <div key={deviceCode} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                backgroundColor: '#e8f5e8',
                border: '2px solid #137333',
                borderRadius: '12px',
                fontSize: '16px'
              }}>
                <span style={{fontFamily: 'monospace', fontWeight: '600', color: '#137333', marginRight: '12px'}}>
                  {deviceCode}
                </span>
                <button 
                  onClick={() => handleDisconnect(deviceCode)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ea4335',
                    cursor: 'pointer',
                    fontSize: '16px',
                    padding: '4px',
                    borderRadius: '4px',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(234, 67, 53, 0.1)'}
                  onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 图库同步功能 */}
        <div style={sectionStyle}>
        <h3 style={{marginTop: 0, marginBottom: '16px', color: '#333', fontSize: '18px', fontWeight: '600'}}>📁 图库同步</h3>
        <p style={{marginBottom: '24px', fontSize: '14px', color: '#5f6368', lineHeight: '1.5'}}>
          通过P2P连接进行设备同步，传输数据库和图片文件
        </p>
          <button 
          onClick={handleSyncClick}
          style={{
            ...buttonStyle,
            backgroundColor: '#137333'
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = '#0d652d';
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 6px 20px rgba(19, 115, 51, 0.4)';
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = '#137333';
            e.target.style.transform = 'translateY(0px)';
            e.target.style.boxShadow = '0 4px 16px rgba(19, 115, 51, 0.3)';
          }}
          >
          🔄 开始同步
        </button>
      </div>

      {/* 设备选择弹窗 */}
      <DeviceSelectionModal
        isOpen={showDeviceSelection}
        onClose={handleDeviceSelectionClose}
        onSelectDevice={handleDeviceSelect}
      />
      
      {/* 同步管理器弹窗 */}
            {showSyncManager && selectedDevice && (
        <Modal
          isOpen={showSyncManager}
          onRequestClose={handleSyncManagerClose}
          style={{
            overlay: {
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              zIndex: 1000,
              backdropFilter: 'blur(4px)'
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
              borderRadius: '16px',
              backgroundColor: 'white',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)'
            }
          }}
          contentLabel="设备同步管理"
        >
          <SyncManager 
            connectedDevices={[selectedDevice.device_code]}
            onClose={handleSyncManagerClose}
          />
        </Modal>
      )}
    </div>
  );
};

// 内部内容组件
const P2PInnerContent = ({ 
  deviceCode, 
  isInitialized, 
  connectedDevices, 
  targetDeviceCode, 
  setTargetDeviceCode, 
  status,
  handleConnect, 
  handleDisconnect,
  historyDevices
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
        // 单向同步进度
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
          setSyncPhase('单向同步完成！');
          setSyncProgress(100);
          setSyncDetails('所有文件已成功传输');
          break;
        case 'sync_error':
          setSyncPhase('同步失败');
          setSyncProgress(null);
          setSyncDetails(progress.data.error || '未知错误');
          break;
        
        // 双向同步进度
        case 'phase1_start':
          setSyncPhase('阶段1：拉取对方数据');
          setSyncProgress(10);
          setSyncDetails('开始双向同步流程...');
          break;
        case 'phase1_complete':
          setSyncPhase('阶段1完成');
          setSyncProgress(50);
          setSyncDetails('正在等待对方拉取合并结果...');
          break;
        case 'phase2_start':
          setSyncPhase('阶段2：对方正在拉取');
          setSyncProgress(75);
          setSyncDetails('对方正在获取合并结果...');
          break;
        case 'bidirectional_sync_complete':
          setSyncPhase('双向同步完成！');
          setSyncProgress(100);
          setSyncDetails('双向数据同步成功');
          break;
        case 'bidirectional_sync_error':
          setSyncPhase('双向同步失败');
          setSyncProgress(null);
          setSyncDetails(progress.data.error || '双向同步过程中发生错误');
          break;
          
        // 接收方的进度事件
        case 'receive_start':
          setSyncPhase(`正在接收${progress.data.fileType === 'database' ? '数据库' : '图片'}...`);
          setSyncProgress(10);
          setSyncDetails(progress.data.fileName || '');
          break;
        case 'receive_progress':
          setSyncProgress(progress.data.progress);
          break;
        case 'receive_complete':
          setSyncPhase('接收完成');
          setSyncProgress(100);
          setSyncDetails(progress.data.fileName ? `已接收: ${progress.data.fileName}` : '');
          break;
        default:
          // 忽略其他进度事件
          console.log('忽略进度事件:', progress.type);
          break;
      }
    });

    return removeHandler;
  }, []);

  const containerStyleInner = {
    maxWidth: '500px',
    width: '100%',
    margin: '0 auto',
    padding: '0'
  };

  const cardStyle = {
    padding: '32px',
    backgroundColor: 'white',
    borderRadius: '16px',
    border: 'none',
    textAlign: 'center',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)'
  };

  const deviceCodeStyle = {
    fontFamily: 'monospace',
    fontSize: '36px',
    fontWeight: '700',
    color: '#4285f4',
    letterSpacing: '3px',
    marginBottom: '12px'
  };

  const inputStyleInner = {
    width: '100%',
    padding: '16px 20px',
    border: '2px solid #e8eaed',
    borderRadius: '12px',
    fontSize: '18px',
    textAlign: 'center',
    fontFamily: 'monospace',
    letterSpacing: '2px',
    marginBottom: '20px',
    backgroundColor: 'white',
    transition: 'border-color 0.3s ease'
  };

  const buttonStyleInner = {
    padding: '16px 32px',
    backgroundColor: '#4285f4',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 16px rgba(66, 133, 244, 0.3)',
    width: '100%'
  };

  const syncButtonStyle = {
    ...buttonStyleInner,
    backgroundColor: '#137333',
    fontSize: '16px',
    padding: '16px 24px',
    marginTop: '12px',
    flex: 1
  };

  const progressBarStyle = {
    width: '100%',
    height: '8px',
    backgroundColor: '#f1f3f4',
    borderRadius: '4px',
    marginTop: '16px',
    overflow: 'hidden'
  };

  const progressFillStyle = {
    height: '100%',
    backgroundColor: '#4285f4',
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
      
      // 使用第一个连接的设备开始单向同步
      const targetDevice = connectedDevices[0];
      console.log('开始单向同步到设备:', targetDevice);
      
      await peerService.startSync(targetDevice);
    } catch (error) {
      console.error('开始单向同步失败:', error);
      setSyncProgress(null);
    }
  };

  // 双向同步处理函数
  const handleStartBidirectionalSync = async () => {
    if (!connectedDevices || connectedDevices.length === 0) {
      console.error('没有连接的设备');
      return;
    }

    try {
      setSyncProgress(0);
      
      // 使用第一个连接的设备开始双向同步
      const targetDevice = connectedDevices[0];
      console.log('开始双向同步到设备:', targetDevice);
      
      await peerService.startBidirectionalSync(targetDevice);
    } catch (error) {
      console.error('开始双向同步失败:', error);
      setSyncProgress(null);
    }
  };

  const deviceCardStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 16px',
    margin: '6px',
    backgroundColor: '#4285f4',
    color: 'white',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    minWidth: '90px',
    boxShadow: '0 4px 16px rgba(66, 133, 244, 0.3)',
    fontSize: '14px',
    fontWeight: '500'
  };

  return (
    <div style={containerStyleInner}>
      <div style={cardStyle}>
        {/* 1. 显示当前设备码 */}
        <h3 style={{marginTop: 0, marginBottom: '20px', color: '#333', fontSize: '20px', fontWeight: '600'}}>📱 当前设备码</h3>
        <div style={deviceCodeStyle}>{deviceCode || '------'}</div>
        <div style={{fontSize: '14px', color: '#5f6368', marginBottom: '40px'}}>
          其他设备使用此代码连接
        </div>

        {/* 2. 历史设备卡片和连接输入框 */}
        {!isConnected && (
          <>
            {/* 历史设备卡片 */}
            {historyDevices && historyDevices.length > 0 && (
              <div style={{marginBottom: '32px'}}>
                <h4 style={{margin: '0 0 16px 0', color: '#5f6368', fontSize: '14px', fontWeight: '500'}}>
                  历史连接设备
                </h4>
                                 <div style={{
                   display: 'flex',
                   flexWrap: 'wrap',
                   justifyContent: 'center',
                   gap: '8px',
                   marginBottom: '24px'
                 }}>
                   {historyDevices.map((code) => (
                     <button
                       key={code}
                       onClick={() => handleConnect(code)}
                       style={deviceCardStyle}
                       disabled={!isInitialized}
                       onMouseOver={(e) => {
                         if (isInitialized) {
                           e.target.style.backgroundColor = '#3367d6';
                           e.target.style.transform = 'translateY(-2px)';
                         }
                       }}
                       onMouseOut={(e) => {
                         e.target.style.backgroundColor = '#4285f4';
                         e.target.style.transform = 'translateY(0px)';
                       }}
                     >
                       <div style={{fontFamily: 'monospace', fontSize: '16px', fontWeight: '600'}}>{code}</div>
                     </button>
                   ))}
                </div>
                <div style={{color: '#5f6368', fontSize: '12px', marginBottom: '20px'}}>
                  或者手动输入设备代码
                </div>
              </div>
            )}

            {/* 手动输入 */}
            <div>
              <input
                type="text"
                placeholder="请输入6位设备代码"
                value={targetDeviceCode}
                onChange={(e) => setTargetDeviceCode(e.target.value)}
                style={inputStyleInner}
                maxLength={6}
                pattern="[0-9]{6}"
                onKeyPress={(e) => e.key === 'Enter' && handleConnect()}
                onFocus={(e) => e.target.style.borderColor = '#4285f4'}
                onBlur={(e) => e.target.style.borderColor = '#e8eaed'}
              />
              <button 
                onClick={() => handleConnect()} 
                style={{
                  ...buttonStyleInner,
                  opacity: isInitialized ? 1 : 0.5
                }}
                disabled={!isInitialized}
                onMouseOver={(e) => {
                  if (isInitialized) {
                    e.target.style.backgroundColor = '#3367d6';
                    e.target.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = '#4285f4';
                  e.target.style.transform = 'translateY(0px)';
                }}
              >
                {isInitialized ? '连接设备' : '初始化中...'}
              </button>
            </div>
          </>
        )}

        {/* 3. 连接成功后显示同步功能 */}
        {isConnected && (
          <>
            <div style={{
              padding: '16px',
              backgroundColor: '#e8f5e8',
              border: '2px solid #137333',
              borderRadius: '12px',
              color: '#137333',
              marginBottom: '32px',
              fontSize: '16px',
              fontWeight: '500'
            }}>
              ✅ 已连接到设备: {connectedDevices.join(', ')}
            </div>

            <div style={{
              display: 'flex',
              gap: '16px',
              marginTop: '24px',
              justifyContent: 'center'
            }}>
              <button 
                onClick={handleStartSync}
                style={{
                  ...syncButtonStyle,
                  backgroundColor: '#1a73e8'
                }}
                disabled={syncProgress !== null && syncProgress < 100}
                onMouseOver={(e) => {
                  if (!(syncProgress !== null && syncProgress < 100)) {
                    e.target.style.backgroundColor = '#1557b0';
                    e.target.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = '#1a73e8';
                  e.target.style.transform = 'translateY(0px)';
                }}
              >
                📥 单向同步
              </button>
              <button 
                onClick={handleStartBidirectionalSync}
                style={{
                  ...syncButtonStyle,
                  backgroundColor: '#137333'
                }}
                disabled={syncProgress !== null && syncProgress < 100}
                onMouseOver={(e) => {
                  if (!(syncProgress !== null && syncProgress < 100)) {
                    e.target.style.backgroundColor = '#0d652d';
                    e.target.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = '#137333';
                  e.target.style.transform = 'translateY(0px)';
                }}
              >
                🔄 双向同步
              </button>
            </div>

            {syncProgress !== null && (
              <div style={{marginTop: '32px'}}>
                <div style={{marginBottom: '12px', fontSize: '14px', color: '#5f6368', fontWeight: '500'}}>
                  {syncPhase} {syncProgress}%
                </div>
                <div style={progressBarStyle}>
                  <div style={progressFillStyle}></div>
                </div>
                {syncDetails && (
                  <div style={{
                    marginTop: '12px',
                    fontSize: '12px',
                    color: '#5f6368'
                  }}>
                    {syncDetails}
                  </div>
                )}
                {syncProgress === 100 && (
                  <div style={{
                    marginTop: '16px',
                    color: '#137333',
                    fontWeight: '600',
                    fontSize: '16px'
                  }}>
                    ✅ 同步完成！
                  </div>
                )}
              </div>
            )}

            <div style={{marginTop: '24px'}}>
              <button 
                onClick={() => {
                  connectedDevices.forEach(deviceCode => handleDisconnect(deviceCode));
                  // 重置同步状态
                  setSyncProgress(null);
                  setSyncPhase('');
                  setSyncDetails('');
                }}
                style={{
                  ...buttonStyleInner,
                  backgroundColor: '#ea4335',
                  fontSize: '14px',
                  padding: '12px 24px'
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#d33b2c';
                  e.target.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = '#ea4335';
                  e.target.style.transform = 'translateY(0px)';
                }}
              >
                断开连接
              </button>
        </div>
          </>
        )}
        
        {/* 存储状态显示 */}
        <div style={{ marginTop: '24px' }}>
          <StorageStatus />
        </div>
      </div>
    </div>
  );
};

export default P2PDemo; 