// App.js
import React, { useRef, useEffect, useState } from 'react';
import './App.css';
import ImageGrid from './ImageGrid';
import P2PDemo from './components/P2PDemo';
import useDeviceId from './hooks/useDeviceId';
import DeviceService from './services/DeviceService';

function App() {
  const imageGridRef = useRef();
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const deviceId = useDeviceId();

  useEffect(() => {
    let mounted = true;
    if (!deviceId) return;
    (async () => {
      try {
        const res = await DeviceService.registerCurrentDevice(deviceId);
        if (mounted) console.log('registerCurrentDevice result:', res);
      } catch (e) {
        console.error('registerCurrentDevice error', e);
      }
    })();
    return () => { mounted = false; };
  }, [deviceId]);

  const handleSyncClick = () => {
    setIsSyncOpen(true);
  };

  return (
    <div className="App">
      {/* ImageGrid 包含模态框，z-index:1000 */}
      <ImageGrid ref={imageGridRef} onSyncClick={handleSyncClick} />
      <P2PDemo isModalMode={true} isOpen={isSyncOpen} onRequestClose={() => setIsSyncOpen(false)} />
    </div>
  );
}

export default App;
