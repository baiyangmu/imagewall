import React, { useState, useEffect, useRef } from 'react';
import peerService from '../services/PeerService';
import useDeviceId from '../hooks/useDeviceId';
import SyncManager from './SyncManager';

const P2PDemo = () => {
  const deviceId = useDeviceId();
  const [isInitialized, setIsInitialized] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [targetDeviceId, setTargetDeviceId] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('未连接');
  const [showSyncManager, setShowSyncManager] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!deviceId) return;

    const initializePeer = async () => {
      try {
        setStatus('正在初始化...');
        await peerService.initialize(deviceId);
        setIsInitialized(true);
        setStatus('已连接');
        
        addMessage('系统', `P2P服务已启动，设备ID: ${deviceId}`, 'system');
        
        // 更新连接的设备列表
        updateConnectedDevices();
      } catch (error) {
        console.error('初始化P2P失败:', error);
        setStatus(`初始化失败: ${error.message}`);
        addMessage('系统', `初始化失败: ${error.message}`, 'error');
      }
    };

    initializePeer();

    // 设置消息处理器
    const removeMessageHandler = peerService.onMessage((data, fromDeviceId) => {
      if (data.type === 'chat') {
        addMessage(fromDeviceId, data.message, 'received');
      }
    });

    // 设置连接状态处理器
    const removeConnectionHandler = peerService.onConnection((status, deviceId) => {
      if (status === 'connected') {
        addMessage('系统', `设备 ${deviceId} 已连接`, 'system');
      } else if (status === 'disconnected') {
        addMessage('系统', `设备 ${deviceId} 已断开连接`, 'system');
      }
      updateConnectedDevices();
    });

    return () => {
      removeMessageHandler();
      removeConnectionHandler();
      peerService.destroy();
    };
  }, [deviceId]);

  const updateConnectedDevices = () => {
    setConnectedDevices(peerService.getConnectedDevices());
  };

  const addMessage = (sender, text, type = 'normal') => {
    const newMessage = {
      id: Date.now() + Math.random(),
      sender,
      text,
      type,
      timestamp: new Date().toLocaleTimeString()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleConnect = async () => {
    if (!targetDeviceId.trim()) {
      addMessage('系统', '请输入目标设备ID', 'error');
      return;
    }

    try {
      setStatus('正在连接...');
      addMessage('系统', `正在连接到设备: ${targetDeviceId}`, 'system');
      
      await peerService.connectToDevice(targetDeviceId.trim());
      
      setStatus('已连接');
      addMessage('系统', `成功连接到设备: ${targetDeviceId}`, 'system');
      setTargetDeviceId('');
      updateConnectedDevices();
    } catch (error) {
      console.error('连接失败:', error);
      setStatus('连接失败');
      addMessage('系统', `连接失败: ${error.message}`, 'error');
    }
  };

  const handleSendMessage = () => {
    if (!message.trim()) {
      addMessage('系统', '请输入消息内容', 'error');
      return;
    }

    if (connectedDevices.length === 0) {
      addMessage('系统', '没有连接的设备', 'error');
      return;
    }

    try {
      const messageData = {
        type: 'chat',
        message: message.trim(),
        timestamp: Date.now()
      };

      // 广播消息到所有连接的设备
      const result = peerService.broadcast(messageData);
      
      addMessage('我', message.trim(), 'sent');
      addMessage('系统', `消息已发送到 ${result.successCount} 个设备`, 'system');
      
      if (result.errorCount > 0) {
        addMessage('系统', `${result.errorCount} 个设备发送失败`, 'error');
      }
      
      setMessage('');
    } catch (error) {
      console.error('发送消息失败:', error);
      addMessage('系统', `发送失败: ${error.message}`, 'error');
    }
  };

  const handleSendToSpecific = (targetId) => {
    if (!message.trim()) {
      addMessage('系统', '请输入消息内容', 'error');
      return;
    }

    try {
      const messageData = {
        type: 'chat',
        message: message.trim(),
        timestamp: Date.now()
      };

      peerService.sendMessage(targetId, messageData);
      addMessage('我', `→ ${targetId}: ${message.trim()}`, 'sent');
      setMessage('');
    } catch (error) {
      console.error('发送消息失败:', error);
      addMessage('系统', `发送到 ${targetId} 失败: ${error.message}`, 'error');
    }
  };

  const handleDisconnect = (targetId) => {
    peerService.disconnectFromDevice(targetId);
    addMessage('系统', `已断开与设备 ${targetId} 的连接`, 'system');
    updateConnectedDevices();
  };

  const getMessageStyle = (type) => {
    const baseStyle = {
      margin: '8px 0',
      padding: '8px 12px',
      borderRadius: '8px',
      maxWidth: '80%',
      wordWrap: 'break-word'
    };

    switch (type) {
      case 'sent':
        return {
          ...baseStyle,
          backgroundColor: '#007bff',
          color: 'white',
          marginLeft: 'auto',
          textAlign: 'right'
        };
      case 'received':
        return {
          ...baseStyle,
          backgroundColor: '#e9ecef',
          color: '#333'
        };
      case 'system':
        return {
          ...baseStyle,
          backgroundColor: '#fff3cd',
          color: '#856404',
          fontStyle: 'italic',
          fontSize: '14px',
          margin: '4px auto',
          textAlign: 'center',
          maxWidth: '90%'
        };
      case 'error':
        return {
          ...baseStyle,
          backgroundColor: '#f8d7da',
          color: '#721c24',
          fontStyle: 'italic',
          fontSize: '14px',
          margin: '4px auto',
          textAlign: 'center',
          maxWidth: '90%'
        };
      default:
        return baseStyle;
    }
  };

  const containerStyle = {
    maxWidth: '900px',
    margin: '20px auto',
    padding: '30px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#f9f9f9'
  };

  const headerStyle = {
    marginBottom: '25px',
    padding: '15px',
    backgroundColor: '#007bff',
    color: 'white',
    borderRadius: '4px',
    textAlign: 'center'
  };

  const inputGroupStyle = {
    display: 'flex',
    gap: '12px',
    marginBottom: '15px',
    alignItems: 'center'
  };

  const inputStyle = {
    flex: 1,
    padding: '12px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '16px'
  };

  const buttonStyle = {
    padding: '12px 20px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px'
  };

  const messagesStyle = {
    height: '450px',
    overflowY: 'auto',
    border: '1px solid #ccc',
    borderRadius: '4px',
    padding: '15px',
    backgroundColor: 'white',
    marginBottom: '15px'
  };

  const deviceListStyle = {
    margin: '15px 0',
    padding: '15px',
    backgroundColor: '#e9ecef',
    borderRadius: '4px'
  };

  const deviceItemStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #ccc'
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h3>P2P 通信演示</h3>
        <div>当前设备ID: {deviceId || '加载中...'}</div>
        <div>状态: {status}</div>
      </div>

      {/* 连接设备 */}
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

      {/* 已连接的设备 */}
      {connectedDevices.length > 0 && (
        <div style={deviceListStyle}>
          <strong>已连接的设备 ({connectedDevices.length}):</strong>
          {connectedDevices.map(deviceId => (
            <div key={deviceId} style={deviceItemStyle}>
              <span>{deviceId}</span>
              <button 
                onClick={() => handleDisconnect(deviceId)}
                style={{...buttonStyle, backgroundColor: '#dc3545', fontSize: '12px', padding: '4px 8px'}}
              >
                断开
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 消息显示区域 */}
      <div style={messagesStyle}>
        {messages.map(msg => (
          <div key={msg.id} style={getMessageStyle(msg.type)}>
            <div>
              {msg.type === 'sent' || msg.type === 'received' ? (
                <>
                  <strong>{msg.sender}</strong> ({msg.timestamp})
                  <br />
                  {msg.text}
                </>
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 发送消息 */}
      <div style={inputGroupStyle}>
        <input
          type="text"
          placeholder="输入消息..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={inputStyle}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
        />
        <button 
          onClick={handleSendMessage} 
          style={buttonStyle} 
          disabled={!isInitialized || connectedDevices.length === 0}
        >
          广播
        </button>
      </div>

      {/* 发送给特定设备 */}
      {connectedDevices.length > 0 && (
        <div style={{marginTop: '10px'}}>
          <strong>发送给特定设备:</strong>
          <div style={{display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px'}}>
            {connectedDevices.map(deviceId => (
              <button
                key={deviceId}
                onClick={() => handleSendToSpecific(deviceId)}
                style={{...buttonStyle, backgroundColor: '#28a745', fontSize: '12px', padding: '4px 8px'}}
                disabled={!message.trim()}
              >
                → {deviceId.slice(0, 8)}...
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 图库同步功能 */}
      {connectedDevices.length > 0 && (
        <div style={{marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef'}}>
          <strong style={{display: 'block', marginBottom: '10px', color: '#333'}}>📁 图库同步功能:</strong>
          <div style={{marginBottom: '10px', fontSize: '14px', color: '#666'}}>
            将本设备的数据库(test2.db)和所有图片同步到其他设备
          </div>
          <button 
            onClick={() => setShowSyncManager(true)}
            style={{...buttonStyle, backgroundColor: '#17a2b8', padding: '10px 20px'}}
          >
            🔄 开始图库同步
          </button>
        </div>
      )}

      {/* 同步管理器 */}
      {showSyncManager && (
        <SyncManager 
          connectedDevices={connectedDevices}
          onClose={() => setShowSyncManager(false)}
        />
      )}

      <div style={{marginTop: '20px', fontSize: '14px', color: '#666'}}>
        <strong>局域网P2P连接说明:</strong>
        <ul style={{margin: '8px 0', paddingLeft: '20px'}}>
          <li>✅ 在同一局域网的其他设备上打开此页面</li>
          <li>📋 复制该设备的设备ID，发送给目标设备</li>
          <li>🔗 在目标设备输入设备ID，点击"连接设备"</li>
          <li>💬 连接成功后，消息将直接在局域网内传输</li>
          <li>🚀 局域网连接速度快，延迟低，无需担心外网流量</li>
        </ul>
        <div style={{marginTop: '10px', padding: '8px', backgroundColor: '#e7f3ff', borderRadius: '4px', fontSize: '13px'}}>
          <strong>💡 提示:</strong> 此应用针对局域网优化，确保所有设备连接在同一WiFi网络下效果最佳。
        </div>
      </div>
    </div>
  );
};

export default P2PDemo; 