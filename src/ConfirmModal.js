// ConfirmModal.js
import React from 'react';
import Modal from 'react-modal';
import './ConfirmModal.css';

Modal.setAppElement('#root'); // 设置应用元素以增强无障碍性

const ConfirmModal = ({ isOpen, onRequestClose, onConfirm, message }) => {
  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="确认删除"
      className="confirm-modal"
      overlayClassName="confirm-overlay"
      closeTimeoutMS={300} // 与 CSS transition 一致
    >
      <div className="confirm-content">
        <p>{message}</p>
        <div className="confirm-buttons">
          <button onClick={onConfirm} className="confirm-button">确定</button>
          <button onClick={onRequestClose} className="cancel-button">取消</button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmModal;
