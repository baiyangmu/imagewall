import React from 'react';
import './ConfirmDialog.css';

const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        {title && <div className="confirm-dialog-title">{title}</div>}
        <div className="confirm-dialog-message">{message}</div>
        <div className="confirm-dialog-buttons">
          <button className="confirm-dialog-btn cancel-btn" onClick={onCancel}>
            取消
          </button>
          <button className="confirm-dialog-btn confirm-btn" onClick={onConfirm}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog; 