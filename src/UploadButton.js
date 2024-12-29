// UploadButton.js
import React, { useState } from 'react';
import './UploadButton.css';

const API_URL = process.env.REACT_APP_API_URL;

const UploadButton = ({ onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  // 当用户选中文件时立即上传
  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setError(null);

    // 开始上传
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        alert('图片上传成功！');
        // 通知父组件刷新图片列表
        if (onUploadSuccess) {
          onUploadSuccess();
        }
      } else {
        setError(data.error || '上传失败');
      }
    } catch (err) {
      console.error('Error uploading image:', err);
      setError('上传过程中发生错误');
    } finally {
      setUploading(false);
      // 重置 file input 的值，方便下次上传
      event.target.value = null;
    }
  };

  return (
    <div className="upload-container">
      {/* 隐藏的文件选择 */}
      <input
        type="file"
        accept="image/*"
        id="file-input"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* “上传”按钮 */}
      <label htmlFor="file-input" className="upload-button small-btn">
        {uploading ? '上传中...' : '上传'}
      </label>

      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default UploadButton;
