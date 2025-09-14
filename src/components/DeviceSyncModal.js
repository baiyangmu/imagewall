import React, { useState } from 'react';
import Modal from 'react-modal';
import './DeviceSyncModal.css';
import useDeviceId from '../hooks/useDeviceId';
import DeviceService from '../services/DeviceService';

Modal.setAppElement('#root');

const DeviceSyncModal = ({ isOpen, onRequestClose }) => {
  const deviceId = useDeviceId();
  const [mode, setMode] = useState('show'); // 'show' or 'enter'
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  const handleRegister = async () => {
    // Deprecated: do not auto-register current device here.
    // Keep for compatibility but prefer explicit server-backed flow.
    setMessage('如果需注册，请使用服务端注册流程（未来实现）。');
  };

  const handleShowCurrent = async () => {
    const cur = await DeviceService.getCurrentDevice();
    if (cur) setMessage(`当前: id=${cur.device_id} code=${cur.device_code}`);
    else setMessage('未设置当前设备');
  };

  const handleLookup = async () => {
    if (!/^[0-9]{6}$/.test(code)) { setMessage('请输入6位数字'); return; }
    // 1) try local lookup
    let id = await DeviceService.lookupDeviceByCode(code);
    if (id) { setMessage(`找到本地设备: ${id}`); return; }
    // 2) try server lookup (not implemented yet)
    const remote = await DeviceService.fetchDeviceFromServer(code);
    if (remote && remote.device_id) {
      setMessage(`从服务器找到设备: ${remote.device_id}（将不会自动注册到本机）`);
      return;
    }
    setMessage('未找到设备');
  };

  return (
    <Modal isOpen={isOpen} onRequestClose={onRequestClose} overlayClassName="overlay" className="modal">
      <div className="modal-content device-sync-modal">
        <div className="modal-header">
          <h3>设备同步</h3>
          <div className="mode-switch">
            <button onClick={() => setMode('show')} className={mode==='show'?'active':''}>本设备码</button>
            <button onClick={() => setMode('enter')} className={mode==='enter'?'active':''}>输入设备码</button>
          </div>
        </div>

        <div className="modal-body">
          {mode === 'show' ? (
            <div>
              <div>设备 ID: {deviceId}</div>
              <div style={{marginTop:8}}>
                <button onClick={handleRegister}>生成/显示 本设备码</button>
                <button style={{marginLeft:8}} onClick={handleShowCurrent}>显示当前设备</button>
              </div>
              <div className="message">{message}</div>
            </div>
          ) : (
            <div>
              <div>输入6位设备码：</div>
              <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
              <button onClick={handleLookup}>查找并同步</button>
              <div className="message">{message}</div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onRequestClose}>关闭</button>
        </div>
      </div>
    </Modal>
  );
};

export default DeviceSyncModal;


