// ImageGrid.js
import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import Masonry from 'react-masonry-css';
import ImageItem from './ImageItem';
import ActionMenu from './components/ActionMenu';
import Modal from 'react-modal';
import './ImageGrid.css';
import ImageService from './services/ImageService';
import JSZip from 'jszip';
import ConfirmDialog from './components/ConfirmDialog';

Modal.setAppElement('#root');


const ImageGrid = forwardRef(({ setIsModalOpen, onSyncClick }, ref) => {
  const [images, setImages] = useState([]);
  const [blobMap, setBlobMap] = useState({}); // id -> objectURL
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [allImageIds, setAllImageIds] = useState([]); 
  const isLandscape = window.innerWidth > window.innerHeight;
  const [startTouch, setStartTouch] = useState(0); // 记录触摸起始点
  const [dragDistance, setDragDistance] = useState(0); // 拖动的距离

  // 模态框状态
  const [selectedImage, setSelectedImage] = useState({ id: null, src: null });
  const [imageOrientation, setImageOrientation] = useState('landscape'); // 'portrait' 或 'landscape'
  const [modalContentSize, setModaContentSize] = useState({ width: 0, height: 0 });
  const [currentIndex, setCurrentIndex] = useState(null);

  // 新增：多选相关状态
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [batchOperationLoading, setBatchOperationLoading] = useState(false);
  
  // 确认对话框状态
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogMessage, setConfirmDialogMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const observer = useRef();
  const triggerRef = useRef();
  const loadedPages = useRef(new Set());

  useImperativeHandle(ref, () => ({
    reloadImages: () => {
      setImages([]);
      setPage(1);
      setHasMore(true);
      loadedPages.current.clear();
      // 退出多选模式
      exitMultiSelectMode();
    },
  }));

  // 新增：多选模式相关函数
  const enterMultiSelectMode = (imageId) => {
    setIsMultiSelectMode(true);
    setSelectedImages(new Set([imageId]));
  };

  const exitMultiSelectMode = () => {
    setIsMultiSelectMode(false);
    setSelectedImages(new Set());
  };

  const toggleImageSelection = (imageId) => {
    setSelectedImages(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(imageId)) {
        newSelected.delete(imageId);
      } else {
        newSelected.add(imageId);
      }
      return newSelected;
    });
  };

  const toggleSelectAll = () => {
    if (selectedImages.size === images.length && images.length > 0) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(images.map(img => img.id)));
    }
  };

  // 确认对话框处理函数
  const showConfirm = (message, action) => {
    setConfirmDialogMessage(message);
    setConfirmAction(() => action);
    setShowConfirmDialog(true);
  };

  const handleConfirm = () => {
    if (confirmAction) {
      confirmAction();
    }
    setShowConfirmDialog(false);
    setConfirmAction(null);
  };

  const handleCancel = () => {
    setShowConfirmDialog(false);
    setConfirmAction(null);
  };

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedImages.size === 0) return;
    
    showConfirm(
      `确定要删除选中的 ${selectedImages.size} 张图片吗？`,
      async () => {
        setBatchOperationLoading(true);
        try {
          let successCount = 0;
          const deletePromises = Array.from(selectedImages).map(async (imageId) => {
            try {
              const success = await ImageService.deleteImage(imageId);
              if (success) {
                handleDelete(imageId);
                successCount++;
                return imageId;
              }
            } catch (error) {
              console.error(`删除图片 ${imageId} 失败:`, error);
            }
            return null;
          });

          await Promise.all(deletePromises);
          
          alert(`成功删除 ${successCount} 张图片`);
          exitMultiSelectMode();
        } catch (error) {
          console.error('批量删除失败:', error);
          alert('批量删除过程中发生错误');
        } finally {
          setBatchOperationLoading(false);
        }
      }
    );
  };

  // 批量下载选中图片
  const handleBatchDownload = async () => {
    if (selectedImages.size === 0) return;
    
    setBatchOperationLoading(true);
    try {
      const zip = new JSZip();
      let successCount = 0;
      
      const selectedImageArray = Array.from(selectedImages);
      
      for (let i = 0; i < selectedImageArray.length; i++) {
        const imageId = selectedImageArray[i];
        try {
          const result = await ImageService.getImage(imageId);
          if (result && result.blob && result.meta) {
            const hash = result.meta.hash || `image_${imageId}`;
            let extension = '.jpg';
            if (result.blob.type) {
              if (result.blob.type.includes('png')) extension = '.png';
              else if (result.blob.type.includes('gif')) extension = '.gif';
              else if (result.blob.type.includes('webp')) extension = '.webp';
            }
            
            const fileName = `${hash}${extension}`;
            zip.file(fileName, result.blob);
            successCount++;
          }
        } catch (imgError) {
          console.warn(`下载图片 ${imageId} 失败:`, imgError);
        }
      }
      
      if (successCount === 0) {
        alert('没有成功下载任何图片');
        return;
      }
      
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `selected_images_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert(`成功下载 ${successCount} 张图片`);
      exitMultiSelectMode();
    } catch (error) {
      console.error('批量下载失败:', error);
      alert('批量下载过程中发生错误');
    } finally {
      setBatchOperationLoading(false);
    }
  };

  const handleUploadSuccess = () => {
    // 重新加载图片
    setImages([]);
    setPage(1);
    setHasMore(true);
    loadedPages.current.clear();
    // 退出多选模式
    exitMultiSelectMode();
  };

  const fetchAllImageIds = useCallback(async () => {
    try {
      const rows = await ImageService.getAllImageIds();
      setAllImageIds(rows);
    } catch (error) {
      console.error('加载所有图片 ID 出错:', error);
    }
  }, []);
  
  useEffect(() => {
    fetchAllImageIds();
  }, [fetchAllImageIds]);

  useEffect(() => {
    fetchAllImageIds();
  }, [fetchAllImageIds]);

  const loadImages = useCallback(async () => {
    // 如果正在加载、没有更多数据了，或当前页已经加载过了，则不再请求
    if (loading || !hasMore || loadedPages.current.has(page)) return;
  
    setLoading(true);
    loadedPages.current.add(page);
  
    try {
      const rows = await ImageService.getImages(page, 10);
      if (rows && rows.length > 0) {
        // filter out any null/invalid rows before adding
        const validRows = rows.filter(r => r && r.id !== null && r.id !== undefined);
        if (validRows.length > 0) {
          setImages((prev) => [...prev, ...validRows]);
        }
        // preload blobs for new (valid) rows
        for (const r of validRows) {
          // avoid duplicate fetch and guard against invalid id
          if (!r || r.id === null || r.id === undefined) continue;
          if (blobMap[r.id]) continue;
          (async () => {
            try {
              const res = await ImageService.getImage(r.id);
              if (res && res.meta && res.blob) {
                const url = URL.createObjectURL(res.blob);
                console.log(`[ImageGrid] Created blob URL for image ${r.id}:`, url);
                setBlobMap((m) => ({ ...m, [r.id]: url }));
              } else {
                console.warn(`[ImageGrid] Failed to load image ${r.id}:`, res);
              }
            } catch (e) { 
              console.warn('preload blob failed', e); 
            }
          })();
        }
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('加载图片时出错:', error);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [page, loading, hasMore]);

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

  useEffect(() => {
    const handleResize = () => {
      if (selectedImage) {
        openModal(selectedImage.id, selectedImage.src);
      }
    };
  
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [selectedImage]);

  // 保持用户提供的 breakpointColumnsObj 配置
  const breakpointColumnsObj = {
    default: 5,
    1600: 5,
    1200: 4,
    900: 3,
    600: 2,
    300: 1
  };

  const handleTouchStart = (e) => {
    const touchStartX = e.touches[0].clientX; // 获取第一个触摸点的 X 坐标
    setStartTouch(touchStartX);
  };
    // 触摸移动时
  const handleTouchMove = (e) => {
    const touchMoveX = e.touches[0].clientX; // 获取当前触摸点的 X 坐标
    const distance = touchMoveX - startTouch; // 计算拖动的距离
    setDragDistance(distance);
  };

    // 触摸结束时
  const handleTouchEnd = () => {
    if (dragDistance > 100) {
      prevImage(); // 向右拖动，切换到上一页
    } else if (dragDistance < -100) {
      nextImage(); // 向左拖动，切换到下一页
    }

    setDragDistance(0); // 重置拖动距离
  };


    // 切换到上一张图片
  const prevImage = async () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      const newImage = allImageIds[newIndex];
      await openModal(newImage.id);
    } else {
      console.log('已经是第一张图片');
    }
  };

  // 切换到下一张图片
  const nextImage = async () => {
    if (currentIndex < allImageIds.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      const newImage = allImageIds[newIndex];
      await openModal(newImage.id);
    } else {
      console.log('已经是最后一张图片');
    }
  };
    

  // 打开模态框，使用本地获取 blob 的方式
  const openModal = async (id) => {
    const index = allImageIds.findIndex((image) => image.id === id);
    if (index !== -1) {
      setCurrentIndex(index);
    }
    try {
      const res = await ImageService.getImage(id);
      if (!res || !res.meta || !res.blob) {
        console.warn('openModal: image meta/blob missing for id', id);
        return;
      }
      const src = URL.createObjectURL(res.blob);
      setSelectedImage({ id, src });
      // 创建一个新的 Image 对象来获取自然尺寸
      const img = new Image();
      img.src = src;
  
      img.onload = () => {
      const { naturalWidth, naturalHeight } = img;
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
  
      let modalContentWidth, modalContentHeight;
  
      // 判断图片方向
      if (naturalHeight > naturalWidth) {
        // 纵向图片
        setImageOrientation('portrait');
  
        if (screenHeight / screenWidth > naturalHeight / naturalWidth) {
          // 屏幕更"高"，以宽度为基准
          modalContentWidth = screenWidth * 0.9;
          modalContentHeight = modalContentWidth * (naturalHeight / naturalWidth);
        } else {
          // 屏幕更"宽"，以高度为基准
          modalContentHeight = screenHeight * 0.9;
          modalContentWidth = modalContentHeight * (naturalWidth / naturalHeight);
        }
      } else {
        // 横向图片
        setImageOrientation('landscape');
  
        if (screenWidth / screenHeight > naturalWidth / naturalHeight) {
          // 屏幕更"宽"，以高度为基准
          modalContentHeight = screenHeight * 0.9;
          modalContentWidth = modalContentHeight * (naturalWidth / naturalHeight);
        } else {
          // 屏幕更"高"，以宽度为基准
          modalContentWidth = screenWidth * 0.9;
          modalContentHeight = modalContentWidth * (naturalHeight / naturalWidth);
        }
      }
  
      // 设置模态框的宽高
      setModaContentSize({ width: modalContentWidth, height: modalContentHeight });
    };
    } catch (err) {
      console.warn('openModal error', err);
    }
  };

  // 关闭模态框
  const closeModal = () => {
    setSelectedImage({ id: null, src: null });
    setImageOrientation('landscape'); // 重置为默认
  };

  // 使用 ref 来追踪当前的 blobMap 用于清理
  const blobMapRef = useRef({});
  
  // 更新 blobMapRef 当 blobMap 改变时
  useEffect(() => {
    blobMapRef.current = blobMap;
  }, [blobMap]);

  // cleanup objectURLs when component unmounts
  useEffect(() => {
    return () => {
      Object.values(blobMapRef.current).forEach(url => { 
        try { 
          URL.revokeObjectURL(url); 
        } catch(e){
          console.warn('Failed to cleanup blob URL:', e);
        } 
      });
    };
  }, []); // 空依赖数组，只在组件卸载时执行

  // 处理图片删除
  const handleDelete = (id) => {
    console.log(`[ImageGrid] Deleting image with id: ${id}`);
    
    // 从images数组中移除
    setImages((prevImages) => prevImages.filter((image) => image.id !== id));
    
    // 从blobMap中清理blob URL，避免内存泄漏和状态不一致
    setBlobMap((prevBlobMap) => {
      const newBlobMap = { ...prevBlobMap };
      if (newBlobMap[id]) {
        console.log(`[ImageGrid] Revoking blob URL for deleted image: ${id}`);
        try {
          URL.revokeObjectURL(newBlobMap[id]);
        } catch (e) {
          console.warn('Failed to revoke blob URL:', e);
        }
        delete newBlobMap[id];
      }
      return newBlobMap;
    });
    
    // 从allImageIds中移除
    setAllImageIds((prevIds) => prevIds.filter((image) => image.id !== id));

    // 如果删除的是当前选中的图片，关闭模态框
    if (selectedImage.id === id) {
      closeModal();
    }
  };

  return (
    <div className={`image-grid-container ${isMultiSelectMode ? 'multi-select-active' : ''}`}>
      {/* 多选模式批量操作栏 */}
      {isMultiSelectMode && (
        <div className="batch-operation-bar">
          <div className="batch-info">
            已选择 {selectedImages.size} 张图片
          </div>
          <div className="batch-actions">
            <button 
              className="batch-btn select-all-btn"
              onClick={toggleSelectAll}
              disabled={batchOperationLoading}
            >
              {selectedImages.size === images.length && images.length > 0 ? '取消全选' : '全选'}
            </button>
            <button 
              className="batch-btn download-btn"
              onClick={handleBatchDownload}
              disabled={selectedImages.size === 0 || batchOperationLoading}
            >
              {batchOperationLoading ? '下载中...' : '下载'}
            </button>
            <button 
              className="batch-btn delete-btn"
              onClick={handleBatchDelete}
              disabled={selectedImages.size === 0 || batchOperationLoading}
            >
              {batchOperationLoading ? '删除中...' : '删除'}
            </button>
            <button 
              className="batch-btn cancel-btn"
              onClick={exitMultiSelectMode}
              disabled={batchOperationLoading}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <Masonry
        breakpointCols={breakpointColumnsObj}
        className="my-masonry-grid"
        columnClassName="my-masonry-grid_column"
      >
                {/* ActionMenu作为第一个网格项目 */}
        <ActionMenu 
          onUploadSuccess={handleUploadSuccess}
          onSyncClick={onSyncClick}
        />
        {images.map((image) => 
          blobMap[image.id] ? (
            <ImageItem
              key={image.id}
              src={blobMap[image.id]}
              id={image.id}
              onClick={() => {
                if (isMultiSelectMode) {
                  toggleImageSelection(image.id);
                } else {
                  openModal(image.id, blobMap[image.id]);
                }
              }}
              onDelete={handleDelete}
              onLongPress={enterMultiSelectMode}
              isMultiSelectMode={isMultiSelectMode}
              isSelected={selectedImages.has(image.id)}
            />
          ) : (
            <div key={image.id} className="image-loading-placeholder">
              <div className="placeholder-content">
                <div className="loading-spinner"></div>
                <span>加载中...</span>
              </div>
            </div>
          )
        )}
      </Masonry>

      <div ref={triggerRef} />

      {loading && <div className="loading">加载中...</div>}
      {!hasMore && <div className="end">没有更多图片了</div>}

      {/* 模态框 - 只在非多选模式下显示 */}
      {!isMultiSelectMode && (
      <Modal
        isOpen={!!selectedImage.src}
        onRequestClose={closeModal}
        overlayClassName="overlay"
        className={`modal ${imageOrientation}`}
        closeTimeoutMS={300}
        /**
         * 关键点1：禁用React-Modal自带的"点overlay关闭"功能
         * 然后由我们自己在 overlayElement 上手动管理点击事件
         */
        shouldCloseOnOverlayClick={false}
        overlayElement={(overlayProps, contentElement) => (
          // 关键点2：最外层 overlay, 点击它 => 关闭模态
          <div 
            {...overlayProps} 
            onClick={closeModal} // 点击最外层 => 关闭
          >
            {/*
              关键点3：包一层"内容容器" (innerWrapper)，阻止冒泡。
              里面再放真正的 modalContent + 按钮等。
            */}
            <div onClick={(e) => e.stopPropagation()}>
              {contentElement}

              {selectedImage.src && (
                <>
                  <div
                    className="nav-button prev"
                    onClick={(e) => {
                      e.stopPropagation(); // 阻止冒泡
                      prevImage();
                    }}
                  >
                    {"<"}
                  </div>
                  <div
                    className="nav-button next"
                    onClick={(e) => {
                      e.stopPropagation(); // 阻止冒泡
                      nextImage();
                    }}
                  >
                    {">"}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      >
        {/* 这部分就是 modal-content（contentElement） */}
        <div 
          className="modal-content"
          style={{
            width: `${modalContentSize.width}px`,
            height: `${modalContentSize.height}px`,
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <img
            src={selectedImage.src}
            alt="Full Size"
            className="modal-image"
          />
        </div>
      </Modal>
      )}

      {/* 自定义确认对话框 */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        message={confirmDialogMessage}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
});

export default ImageGrid;
