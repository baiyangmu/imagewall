// ImageItem.js
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import ConfirmModal from './ConfirmModal'; // 确保已创建该组件
import { deleteImage as deleteImageLocal } from './services/ImageService';
import './ImageItem.css';

// remove remote API dependency; use local ImageService instead

const ImageItem = ({ 
  src, 
  id, 
  onClick, 
  onDelete, 
  onLongPress, 
  isMultiSelectMode = false, 
  isSelected = false 
}) => {
  const [isShaking, setIsShaking] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLongPress, setIsLongPress] = useState(false); // 使用状态变量跟踪长按
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const timerRef = useRef(null);
  const containerRef = useRef(null);
  const imgRef = useRef(null);
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

  // 处理图片加载成功
  const handleImageLoad = (e) => {
    console.log(`[ImageItem] Image loaded successfully for id: ${id}, naturalWidth: ${e.target.naturalWidth}, naturalHeight: ${e.target.naturalHeight}`);
    setImageLoaded(true);
    setImageError(false);
  };

  // 处理图片加载失败
  const handleImageError = (e) => {
    console.log(`[ImageItem] Image failed to load for id: ${id}, src:`, src, 'error:', e);
    setImageLoaded(false);
    setImageError(true);
  };

  // 当src改变时重置状态
  useEffect(() => {
    if (src) {
      console.log(`[ImageItem] src changed for id: ${id}, new src:`, src);
      setImageLoaded(false);
      setImageError(false);
    }
  }, [src]);

  // 检查图片是否已经加载完成（针对缓存的图片）
  const checkImageLoaded = useCallback((imgElement) => {
    if (imgElement && imgElement.complete && imgElement.naturalWidth > 0) {
      console.log(`[ImageItem] Image already loaded (cached) for id: ${id}`);
      setImageLoaded(true);
      setImageError(false);
      return true;
    }
    return false;
  }, [id]);

  const handleMouseDown = () => {
    // 多选模式下不触发长按删除
    if (isMultiSelectMode) return;
    
    timerRef.current = setTimeout(() => {
      if (onLongPress) {
        onLongPress(id); // 触发进入多选模式
      } else {
        // 原有的删除逻辑
        setIsLongPress(true);
      setIsShaking(true);
      setShowDelete(true);
      }
    }, 500); // 500ms 长按
  };

  const handleMouseUp = () => {
    clearTimeout(timerRef.current);
  };

  const handleTouchStart = () => {
    // 多选模式下不触发长按删除
    if (isMultiSelectMode) return;
    
    timerRef.current = setTimeout(() => {
      if (onLongPress) {
        onLongPress(id); // 触发进入多选模式
      } else {
        // 原有的删除逻辑
        setIsLongPress(true);
      setIsShaking(true);
      setShowDelete(true);
      }
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

    if (isLongPress && !isMultiSelectMode) {
      // 如果是长按且不在多选模式，阻止打开模态框
      setIsLongPress(false); // 重置长按状态
      e.stopPropagation();
      return;
    }

    onClick(); // 在多选模式下是选择，非多选模式下是预览
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
      className={`image-item ${isShaking ? 'shaking' : ''} ${isSelected ? 'selected' : ''} ${isMultiSelectMode ? 'multi-select-mode' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick} // 使用自定义的 handleClick
      ref={setRefs} // 绑定组合后的 refs
    >
      {/* 多选模式下显示选择框 */}
      {isMultiSelectMode && (
        <div className="selection-overlay">
          <div className={`selection-checkbox ${isSelected ? 'checked' : ''}`}>
            {isSelected && <span className="checkmark">✓</span>}
          </div>
        </div>
      )}

            <>
        <img 
          ref={(el) => {
            imgRef.current = el;
            if (el && !checkImageLoaded(el)) {
              console.log(`[ImageItem] Image ref set for id: ${id}, starting to load...`);
            }
          }}
          src={src} 
          alt=""
          onLoad={handleImageLoad}
          onError={handleImageError}
          style={{ 
            opacity: imageLoaded ? 1 : 0,
            width: '100%',
            display: imageError ? 'none' : 'block',
            transition: 'opacity 0.3s ease'
          }}
        />
        {!imageLoaded && !imageError && (
          <div className="image-loading">
            <div className="loading-spinner"></div>
            <span>加载中...</span>
          </div>
        )}
        {imageError && (
          <div className="image-error">
            <span>图片加载失败</span>
          </div>
        )}
      </>
      
      {/* 只在非多选模式下显示删除按钮 */}
      {showDelete && !isMultiSelectMode && (
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
