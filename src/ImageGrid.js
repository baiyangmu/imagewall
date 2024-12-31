// ImageGrid.js
import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import Masonry from 'react-masonry-css';
import ImageItem from './ImageItem';
import Modal from 'react-modal';
import './ImageGrid.css';

Modal.setAppElement('#root');

const API_URL = process.env.REACT_APP_API_URL;

const ImageGrid = forwardRef(({ setIsModalOpen }, ref) => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  // 模态框状态
  const [selectedImage, setSelectedImage] = useState({ id: null, src: null });
  const [imageOrientation, setImageOrientation] = useState('landscape'); // 'portrait' 或 'landscape'

  const observer = useRef();
  const triggerRef = useRef();
  const loadedPages = useRef(new Set());

  useImperativeHandle(ref, () => ({
    reloadImages: () => {
      setImages([]);
      setPage(1);
      setHasMore(true);
      loadedPages.current.clear();
    },
  }));

  const loadImages = useCallback(async () => {
    // 如果正在加载、没有更多数据了，或当前页已经加载过了，则不再请求
    if (loading || !hasMore || loadedPages.current.has(page)) return;
  
    setLoading(true);
    loadedPages.current.add(page);
  
    try {
      const response = await fetch(`${API_URL}/api/images?page=${page}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
      });
  
      if (!response.ok) {
        throw new Error(`Network response was not ok. status: ${response.status}`);
      }
  
      const data = await response.json();
  
      if (data.images && data.images.length > 0) {
        setImages((prev) => [...prev, ...data.images]);
      } else {
        // 正常返回但没有数据了，停止加载
        setHasMore(false);
      }
    } catch (error) {
      console.error('加载图片时出错:', error);
      // 如果后端连接失败或跨域出错，可根据需求：
      // 1. 直接停止所有后续请求
      setHasMore(false);
  
      // 2. 如果希望允许用户后续点击“重试”之类的操作再拉取，可以把当前页从 loadedPages 中移除:
      // loadedPages.current.delete(page);
    } finally {
      setLoading(false);
    }
  }, [API_URL, page, loading, hasMore]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  useEffect(() => {
    if (loading || !hasMore) return;

    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore) {
        setPage((prev) => prev + 1);
      }
    });

    if (triggerRef.current) {
      observer.current.observe(triggerRef.current);
    }

    return () => {
      if (observer.current) observer.current.disconnect();
    };
  }, [loading, hasMore]);

  // 保持用户提供的 breakpointColumnsObj 配置
  const breakpointColumnsObj = {
    default: 5,
    1600: 5,
    1200: 4,
    900: 3,
    600: 2,
    300: 1
  };

  // 打开模态框
  const openModal = (id, imageSrc) => {
    setSelectedImage({ id, src: imageSrc });

    // 创建一个新的 Image 对象来获取自然尺寸
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;

      // 判断图片方向
      if (naturalHeight > naturalWidth) {
        setImageOrientation('portrait');
      } else {
        setImageOrientation('landscape');
      }
    };
  };

  // 关闭模态框
  const closeModal = () => {
    setSelectedImage({ id: null, src: null });
    setImageOrientation('landscape'); // 重置为默认
  };

  // 处理图片删除
  const handleDelete = (id) => {
    setImages((prevImages) => prevImages.filter((image) => image.id !== id));

    // 如果删除的是当前选中的图片，关闭模态框
    if (selectedImage.id === id) {
      closeModal();
    }
  };

  return (
    <div className="image-grid-container">
      <Masonry
        breakpointCols={breakpointColumnsObj}
        className="my-masonry-grid"
        columnClassName="my-masonry-grid_column"
      >
        {images.map((image) => (
          <ImageItem
            key={image.id}
            src={`${API_URL}/api/image/${image.id}`} // 确保 URL 一致
            id={image.id}
            onClick={() => openModal(image.id, `${API_URL}/api/image/${image.id}`)}
            onDelete={handleDelete}
          />
        ))}
      </Masonry>

      <div ref={triggerRef} />

      {loading && <div className="loading">加载中...</div>}
      {!hasMore && <div className="end">没有更多图片了</div>}

      {/* 模态框 */}
      <Modal
        isOpen={selectedImage.src !== null}
        onRequestClose={closeModal}
        contentLabel="图片预览"
        className={`modal ${imageOrientation}`}
        overlayClassName="overlay"
        closeTimeoutMS={300} // 过渡时间，需与 CSS transition 一致
      >
        {selectedImage.src && (
          <div className="modal-content">
            {/* 直接显示图片，无需额外背景层 */}
            <img
              src={selectedImage.src}
              alt="Full Size"
              className="modal-image"
            />
          </div>
        )}
      </Modal>
    </div>
  );
});

export default ImageGrid;
