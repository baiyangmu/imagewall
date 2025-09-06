// ImageItem.js
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import ConfirmModal from './ConfirmModal'; // 确保已创建该组件
import { deleteImage as deleteImageLocal } from './services/ImageService';
import './ImageItem.css';

// remove remote API dependency; use local ImageService instead

const ImageItem = ({ src, id, onClick, onDelete }) => {
  const [isShaking, setIsShaking] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLongPress, setIsLongPress] = useState(false); // 使用状态变量跟踪长按
  const timerRef = useRef(null);
  const containerRef = useRef(null);
  const isCancelingRef = useRef(false); // 使用引用跟踪是否正在取消删除模式

  const { ref: inViewRef, inView } = useInView({
    triggerOnce: true,
    rootMargin: '50px',
  });

  // 组合 refs
  const setRefs = useCallback(
    (node) => {
      containerRef.current = node;
      inViewRef(node);
    },
    [inViewRef]
  );

  const handleMouseDown = () => {
    timerRef.current = setTimeout(() => {
      setIsLongPress(true); // 设置为长按
      setIsShaking(true);
      setShowDelete(true);
    }, 500); // 500ms 长按
  };

  const handleMouseUp = () => {
    clearTimeout(timerRef.current);
  };

  const handleTouchStart = () => {
    timerRef.current = setTimeout(() => {
      setIsLongPress(true); // 设置为长按
      setIsShaking(true);
      setShowDelete(true);
    }, 500); // 500ms 长按
  };

  const handleTouchEnd = () => {
    clearTimeout(timerRef.current);
  };

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleConfirmDelete = async () => {
    try {
      const ok = await deleteImageLocal(id);
      if (ok) {
        onDelete(id);
      } else {
        alert('删除失败');
      }
    } catch (error) {
      console.error('删除图片时出错:', error);
      alert('删除过程中发生错误');
    } finally {
      setIsShaking(false);
      setShowDelete(false);
      closeModal();
      setIsLongPress(false); // 重置长按状态
    }
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation(); // 防止触发 onClick
    openModal();
  };

  const handleClick = (e) => {
    if (isCancelingRef.current) {
      // 如果是取消删除模式的点击，阻止打开模态框
      isCancelingRef.current = false; // 重置取消标志
      e.stopPropagation();
      return;
    }

    if (isLongPress) {
      // 如果是长按，阻止打开模态框
      setIsLongPress(false); // 重置长按状态
      e.stopPropagation();
      return;
    }

    onClick(); // 触发打开预览模态框的逻辑
  };

  // 监听全局点击事件以取消删除模式
  useEffect(() => {
    if (!isShaking) return;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsShaking(false);
        setShowDelete(false);
        setIsLongPress(false); // 重置长按状态
        isCancelingRef.current = true; // 标记为正在取消删除模式
      }
    };

    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isShaking]);

  return (
    <div
      className={`image-item ${isShaking ? 'shaking' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick} // 使用自定义的 handleClick
      ref={setRefs} // 绑定组合后的 refs
    >
      {inView ? (
        <img src={src} alt="Uploaded" loading="lazy" />
      ) : (
        <div className="placeholder"></div>
      )}
      {showDelete && (
        <button
          className="delete-button"
          onClick={handleDeleteClick}
          aria-label="删除图片"
        >
          ×
        </button>
      )}

      {/* 自定义确认删除模态框 */}
      <ConfirmModal
        isOpen={isModalOpen}
        onRequestClose={() => {
          setIsShaking(false);
          setShowDelete(false);
          closeModal();
          setIsLongPress(false); // 重置长按状态
          isCancelingRef.current = true; // 标记为正在取消删除模式
        }}
        onConfirm={handleConfirmDelete}
        message="确定要删除这张图片吗？"
      />
    </div>
  );
};

export default ImageItem;
