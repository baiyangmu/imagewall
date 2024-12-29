// ImageItem.js
import React from 'react';
import './ImageItem.css';

const ImageItem = ({ src, onClick }) => (
  <div className="image-item" onClick={onClick}>
    <img src={src} alt="Uploaded" />
  </div>
);

export default ImageItem;
