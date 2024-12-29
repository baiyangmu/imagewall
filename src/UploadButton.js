// UploadButton.js
import React, { useState } from 'react';
import axios from 'axios';
import './UploadButton.css';

const API_URL = process.env.REACT_APP_API_URL;

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const UploadButton = ({ onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setError(null);

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('不支持的文件类型，请上传 JPG、PNG、GIF 或 WEBP 格式的图片。');
      event.target.value = null;
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_URL}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        },
      });

      if (response.status === 200) {
        alert('图片上传成功！');
        if (onUploadSuccess) {
          onUploadSuccess();
        }
      } else {
        setError(response.data.error || '上传失败');
      }
    } catch (err) {
      console.error('Error uploading image:', err);
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
      />

      <label htmlFor="file-input" className={`upload-button small-btn ${uploading ? 'disabled' : ''}`}>
        {uploading ? `上传中... (${uploadProgress}%)` : '上传'}
      </label>

      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default UploadButton;
