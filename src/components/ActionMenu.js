import React, { useState } from 'react';
import './ActionMenu.css';
import ImageService from '../services/ImageService';
import { initMyDB } from '../services/MyDBService';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const ActionMenu = ({ onUploadSuccess, onSyncClick }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileChange = async (event) => {
    const files = event.target.files;
    if (!files.length) return;

    setError(null);
    setIsMenuOpen(false); // 关闭菜单

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
      
      const filesToUpload = Array.from(files);
      const totalFiles = filesToUpload.length;
      console.log(`[上传] 准备上传${totalFiles}个文件:`, filesToUpload.map(f => f.name));
      
      const uploadWithProgress = async () => {
        let completedFiles = 0;
        const uploadedIds = [];
        
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
          
          const progress = Math.round((completedFiles / totalFiles) * 100);
          console.log(`[上传] 更新进度: ${progress}%`);
          setUploadProgress(progress);
        }
        
        console.log(`[上传] 所有文件处理完成，成功上传: ${completedFiles}/${totalFiles}，uploadedIds:`, uploadedIds);
        return { uploaded_ids: uploadedIds };
      };
      
      console.log('[上传] 调用上传函数');
      const res = await uploadWithProgress();
      console.log('[上传] 上传函数返回结果:', res);
      
      if (res && res.uploaded_ids && res.uploaded_ids.length > 0) {
        if (onUploadSuccess) onUploadSuccess();
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

  const handleSyncClick = () => {
    setIsMenuOpen(false);
    if (onSyncClick) onSyncClick();
  };

  return (
    <div className="action-menu-grid-item">
      {/* 主按钮 - 圆角矩形框+号 */}
      <button 
        className="action-menu-trigger"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        disabled={uploading}
      >
        {uploading ? `${uploadProgress}%` : '+'}
      </button>

      {/* 弹出菜单 */}
      {isMenuOpen && (
        <>
          <div className="action-menu-overlay" onClick={() => setIsMenuOpen(false)} />
          <div className="action-menu-popup">
            <input
              type="file"
              accept="image/*"
              id="action-file-input"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              multiple
            />
            
            <button 
              className="action-menu-item upload-btn"
              onClick={() => document.getElementById('action-file-input').click()}
              disabled={uploading}
            >
              上传
              <span className="action-menu-item-desc">选择图片文件</span>
            </button>
            
            <button 
              className="action-menu-item sync-btn"
              onClick={handleSyncClick}
              disabled={uploading}
            >
              同步
            </button>
          </div>
        </>
      )}

      {error && <div className="action-menu-error">{error}</div>}
    </div>
  );
};

export default ActionMenu; 