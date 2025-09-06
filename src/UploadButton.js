import React, { useState } from 'react';
import axios from 'axios';
import './UploadButton.css';
import ImageService from './services/ImageService';
import useDeviceId from './hooks/useDeviceId';

// removed API_URL; uploads use local ImageService

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const UploadButton = ({ onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const deviceId = useDeviceId();

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
      // Use ImageService to upload to local mydb-backed storage
      await ImageService.initMyDB();
      const res = await ImageService.uploadImages(Array.from(files), deviceId || 'unknown');
      if (res && res.uploaded_ids && res.uploaded_ids.length > 0) {
        if (onUploadSuccess) onUploadSuccess();
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
