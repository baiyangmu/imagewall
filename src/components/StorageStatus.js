import React, { useState, useEffect } from 'react';
import storageService from '../services/StorageService';
import './StorageStatus.css';

const StorageStatus = () => {
  const [storageInfo, setStorageInfo] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;



    // 初始化存储信息
    const initStorage = async () => {
      try {
        const estimate = await storageService.getStorageEstimate();
        
        if (mounted) {
          setStorageInfo(estimate);
          setIsLoading(false);
          if (!estimate.supported) {
            setError('浏览器不支持存储配额检测');
          }
        }
      } catch (error) {
        if (mounted) {
          setError(error.message);
          setIsLoading(false);
        }
      }
    };

    initStorage();

    // 监听存储状态变化
    const removeListener = storageService.addListener((estimate) => {
      if (mounted) {
        setStorageInfo(estimate);
      }
    });

    return () => {
      mounted = false;
      removeListener();
    };
  }, []);



  // 强制显示测试内容，确保组件能够渲染
  if (isLoading) {
    return (
      <div className="storage-status-simple loading">
        <div style={{ padding: '12px', textAlign: 'center', backgroundColor: '#e3f2fd', border: '1px solid #2196f3', borderRadius: '4px' }}>
          <span>🔍 正在检测存储状态...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return null;
  }

  if (!storageInfo) {
    return (
      <div className="storage-status-simple loading">
        <div style={{ padding: '12px', textAlign: 'center', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '4px' }}>
          <span>📊 正在加载存储信息...</span>
        </div>
      </div>
    );
  }

  if (!storageInfo.supported) {
    return null;
  }

  // 根据使用百分比确定状态类型
  const getStatusType = (percentage) => {
    if (percentage >= 90) return 'critical';
    if (percentage >= 80) return 'warning';
    return 'normal';
  };

  const statusType = getStatusType(storageInfo.percentage);

  return (
    <div className={`storage-status-simple ${statusType}`}>
      <div className="storage-info">
        <div className="storage-item">
          <span className="storage-label">剩余空间:</span>
          <span className="storage-value">
            {storageService.formatBytes(storageInfo.remaining)}
          </span>
        </div>
        <div className="storage-item">
          <span className="storage-label">使用率:</span>
          <span className={`storage-value percentage ${statusType}`}>
            {storageInfo.percentage.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="storage-bar">
        <div 
          className="storage-fill"
          style={{
            width: `${Math.min(storageInfo.percentage, 100)}%`
          }}
        ></div>
      </div>
    </div>
  );
};

export default StorageStatus; 