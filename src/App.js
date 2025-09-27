// App.js
import React, { useRef, useEffect, useState } from 'react';
import './App.css';
import ImageGrid from './ImageGrid';
import UploadButton from './UploadButton';
import DeviceSyncButton from './components/DeviceSyncButton';
import P2PDemo from './components/P2PDemo';
// import DownloadDBButton from './components/DownloadDBButton';
// import DownloadImagesButton from './components/DownloadImagesButton';
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

  const handleUploadSuccess = () => {
    if (imageGridRef.current) {
      imageGridRef.current.reloadImages();
    }
  };

  return (
    <div className="App">
      {/* 上传按钮固定在右上角，z-index:500 */}
      <div className="upload-button-wrapper">
        <UploadButton onUploadSuccess={handleUploadSuccess} />
        {/* <DownloadDBButton /> */}
        {/* <DownloadImagesButton /> */}
        <DeviceSyncButton onClick={() => setIsSyncOpen(true)} />
      </div>
      {/* ImageGrid 包含模态框，z-index:1000 */}
      <ImageGrid ref={imageGridRef} />
      <P2PDemo isModalMode={true} isOpen={isSyncOpen} onRequestClose={() => setIsSyncOpen(false)} />
    </div>
  );
}

export default App;
