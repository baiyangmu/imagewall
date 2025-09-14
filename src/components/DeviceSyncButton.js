import React from 'react';
import './DeviceSyncButton.css';

const DeviceSyncButton = ({ onClick }) => {
  return (
    <button className="device-sync-button" onClick={onClick}>
      同步
    </button>
  );
};

export default DeviceSyncButton;


