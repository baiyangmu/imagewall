import React, { useState } from 'react';
import { loadMyDBModule, ensurePersistentFS } from '../services/MyDBService';
import './DownloadDBButton.css';

const DownloadDBButton = () => {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const handleDownloadDB = async () => {
    if (downloading) return;
    
    setDownloading(true);
    setError(null);
    
    try {
      const Module = await loadMyDBModule();
      await ensurePersistentFS(Module);
      
      // 读取数据库文件
      const dbPath = '/persistent/imageWall.db';
      
      try {
        const dbData = Module.FS.readFile(dbPath);
        
        // 创建Blob并下载
        const blob = new Blob([dbData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'imageWall.db';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        console.log('数据库文件下载成功');
      } catch (fileError) {
        console.error('读取数据库文件失败:', fileError);
        setError('数据库文件不存在或读取失败');
      }
      
    } catch (err) {
      console.error('下载数据库失败:', err);
      setError('下载过程中发生错误');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="download-db-container">
      <button 
        className={`download-db-button small-btn ${downloading ? 'disabled' : ''}`}
        onClick={handleDownloadDB}
        disabled={downloading}
      >
        {downloading ? '下载中...' : '下载数据库'}
      </button>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default DownloadDBButton; 