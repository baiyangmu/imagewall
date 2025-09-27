import React, { useState } from 'react';
import ImageService from '../services/ImageService';
import JSZip from 'jszip';
import './DownloadImagesButton.css';

const DownloadImagesButton = () => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const handleDownloadImages = async () => {
    if (downloading) return;
    
    setDownloading(true);
    setProgress(0);
    setError(null);
    
    try {
      // 获取所有图片ID
      const allImageIds = await ImageService.getAllImageIds();
      
      if (!allImageIds || allImageIds.length === 0) {
        setError('没有图片可以下载');
        return;
      }

      const zip = new JSZip();
      let successCount = 0;
      
      for (let i = 0; i < allImageIds.length; i++) {
        const imageData = allImageIds[i];
        setProgress(Math.round(((i + 1) / allImageIds.length) * 100));
        
        try {
          const result = await ImageService.getImage(imageData.id);
          if (result && result.blob && result.meta) {
            // 根据hash生成文件名，保持原有扩展名逻辑
            const hash = result.meta.hash || `image_${imageData.id}`;
            // 尝试从blob类型推断扩展名
            let extension = '.jpg'; // 默认扩展名
            if (result.blob.type) {
              if (result.blob.type.includes('png')) extension = '.png';
              else if (result.blob.type.includes('gif')) extension = '.gif';
              else if (result.blob.type.includes('webp')) extension = '.webp';
            }
            
            const fileName = `${hash}${extension}`;
            zip.file(fileName, result.blob);
            successCount++;
          }
        } catch (imgError) {
          console.warn(`下载图片 ${imageData.id} 失败:`, imgError);
        }
      }
      
      if (successCount === 0) {
        setError('没有成功下载任何图片');
        return;
      }
      
      // 生成ZIP文件
      setProgress(100);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // 下载ZIP文件
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `images_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      console.log(`成功下载 ${successCount} 张图片`);
      
    } catch (err) {
      console.error('批量下载图片失败:', err);
      setError('下载过程中发生错误');
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  };

  return (
    <div className="download-images-container">
      <button 
        className={`download-images-button small-btn ${downloading ? 'disabled' : ''}`}
        onClick={handleDownloadImages}
        disabled={downloading}
      >
        {downloading ? `下载中... ${progress}%` : '下载图片'}
      </button>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default DownloadImagesButton; 