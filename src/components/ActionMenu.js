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
      await initMyDB();
      
      const filesToUpload = Array.from(files);
      const totalFiles = filesToUpload.length;
      
      const uploadWithProgress = async () => {
        let completedFiles = 0;
        const uploadedIds = [];
        
        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i];
          
          try {
            const singleRes = await ImageService.uploadImages([file]);
            
            if (singleRes && singleRes.uploaded_ids && singleRes.uploaded_ids.length > 0) {
              uploadedIds.push(...singleRes.uploaded_ids);
              completedFiles++;
            }
          } catch (fileError) {
          }
          
          const progress = Math.round((completedFiles / totalFiles) * 100);
          setUploadProgress(progress);
        }
        
        return { uploaded_ids: uploadedIds };
      };
      
      const res = await uploadWithProgress();
      
      if (res && res.uploaded_ids && res.uploaded_ids.length > 0) {
        if (onUploadSuccess) onUploadSuccess();
        try { window.location.reload(); } catch (e) { /* ignore in non-browser env */ }
      } else {
        setError('上传失败（本地）');
      }
    } catch (err) {
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