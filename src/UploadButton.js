import React, { useState } from 'react';
import axios from 'axios';
import './UploadButton.css';
import ImageService from './services/ImageService';
import { initMyDB } from './services/MyDBService';

// removed API_URL; uploads use local ImageService

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const UploadButton = ({ onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);


  const handleFileChange = async (event) => {
    const files = event.target.files;
    if (!files.length) return;

    setError(null);

    const invalidFiles = Array.from(files).filter(file => !ALLOWED_MIME_TYPES.includes(file.type));
    if (invalidFiles.length > 0) {
      setError('部分文件类型不支持，请仅上传 JPG、PNG、GIF 或 WEBP 格式的图片。');
      event.target.value = null;
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      console.log('[上传] 开始上传过程，初始化MyDB');
      await initMyDB();
      console.log('[上传] MyDB初始化完成');
      
      // 添加进度更新逻辑
      const filesToUpload = Array.from(files);
      const totalFiles = filesToUpload.length;
      console.log(`[上传] 准备上传${totalFiles}个文件:`, filesToUpload.map(f => f.name));
      
      // 创建带有进度回调的上传函数
      const uploadWithProgress = async () => {
        let completedFiles = 0;
        const uploadedIds = [];
        
        // 一次处理一个文件，更新进度
        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i];
          console.log(`[上传] 开始上传第${i+1}/${totalFiles}个文件: ${file.name}, 大小: ${(file.size / 1024).toFixed(2)}KB`);
          
          try {
            console.time(`上传文件${i+1}`);
            const singleRes = await ImageService.uploadImages([file]);
            console.timeEnd(`上传文件${i+1}`);
            
            console.log(`[上传] 文件${i+1}上传结果:`, singleRes);
            
            if (singleRes && singleRes.uploaded_ids && singleRes.uploaded_ids.length > 0) {
              uploadedIds.push(...singleRes.uploaded_ids);
              completedFiles++;
              console.log(`[上传] 文件${i+1}上传成功，ID:`, singleRes.uploaded_ids);
            } else {
              console.warn(`[上传] 文件${i+1}上传失败，没有返回有效ID`);
            }
          } catch (fileError) {
            console.error(`[上传] 文件${i+1}上传出错:`, fileError);
          }
          
          // 更新进度条
          const progress = Math.round((completedFiles / totalFiles) * 100);
          console.log(`[上传] 更新进度: ${progress}%`);
          setUploadProgress(progress);
        }
        
        console.log(`[上传] 所有文件处理完成，成功上传: ${completedFiles}/${totalFiles}，uploadedIds:`, uploadedIds);
        // 所有文件上传完毕后，返回ID
        return { uploaded_ids: uploadedIds };
      };
      
      console.log('[上传] 调用上传函数');
      const res = await uploadWithProgress();
      console.log('[上传] 上传函数返回结果:', res);
      
      if (res && res.uploaded_ids && res.uploaded_ids.length > 0) {
        if (onUploadSuccess) onUploadSuccess();
        // full reload to ensure new data is shown (matches delete behavior)
        try { window.location.reload(); } catch (e) { /* ignore in non-browser env */ }
      } else {
        setError('上传失败（本地）');
      }
    } catch (err) {
      console.error('Local upload error', err);
      setError('上传过程中发生错误');
    } finally {
      setUploading(false);
      event.target.value = null;
    }
  };

  return (
    <div className="upload-container">
      <input
        type="file"
        accept="image/*"
        id="file-input"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        multiple // 支持多文件选择
      />

      <label htmlFor="file-input" className={`upload-button small-btn ${uploading ? 'disabled' : ''}`}>
        {uploading ? `上传中... (${uploadProgress}%)` : '上传'}
      </label>

      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default UploadButton;
