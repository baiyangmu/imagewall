// App.js
import React, { useRef } from 'react';
import './App.css';
import ImageGrid from './ImageGrid';
import UploadButton from './UploadButton';

function App() {
  const imageGridRef = useRef();

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
      </div>
      {/* ImageGrid 包含模态框，z-index:1000 */}
      <ImageGrid ref={imageGridRef} />
    </div>
  );
}

export default App;
