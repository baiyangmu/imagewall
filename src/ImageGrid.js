// ImageGrid.js
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import Masonry from 'react-masonry-css';
import ImageItem from './ImageItem';
import Modal from 'react-modal';
import './ImageGrid.css';

// 设置模态框的根元素
Modal.setAppElement('#root');

const API_URL = process.env.REACT_APP_API_URL;

const ImageGrid = forwardRef((props, ref) => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  // 模态框状态
  const [selectedImage, setSelectedImage] = useState(null);
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

      const data = await response.json();

      if (data.images && data.images.length > 0) {
        setImages((prev) => [...prev, ...data.images]);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('加载图片时出错:', error);
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
    300:1
  };

  // 打开模态框
  const openModal = (imageSrc) => {
    setSelectedImage(imageSrc);

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
    setSelectedImage(null);
    setImageOrientation('landscape'); // 重置为默认
  };

  return (
    <div className="image-grid-container">
      <Masonry
        breakpointCols={breakpointColumnsObj}
        className="my-masonry-grid"
        columnClassName="my-masonry-grid_column"
      >
        {images.map((image, index) => (
          <ImageItem
            key={`${image.id}-${index}`}
            src={`${API_URL}/image/${image.id}`}
            onClick={() => openModal(`${API_URL}/image/${image.id}`)}
          />
        ))}
      </Masonry>

      <div ref={triggerRef} />

      {loading && <div className="loading">加载中...</div>}
      {!hasMore && <div className="end">没有更多图片了</div>}

      {/* 模态框 */}
      <Modal
        isOpen={selectedImage !== null}
        onRequestClose={closeModal}
        contentLabel="图片预览"
        className={`modal ${imageOrientation}`}
        overlayClassName="overlay"
        closeTimeoutMS={300} // 过渡时间，需与 CSS transition 一致
      >
        {selectedImage && (
          <div className="modal-content">
            {/* 直接显示图片，无需额外背景层 */}
            <img
              src={selectedImage}
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
