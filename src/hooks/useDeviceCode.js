import { useState, useEffect } from 'react';
import DeviceService from '../services/DeviceService';

/**
 * 获取当前设备的6位设备代码
 * 如果设备未注册，会自动注册并返回代码
 * @returns {string|null} 6位设备代码或null
 */
export default function useDeviceCode() {
  const [deviceCode, setDeviceCode] = useState(null);

  useEffect(() => {
    const initializeDeviceCode = async () => {
      try {
        // 首先尝试获取当前设备信息
        let currentDevice = await DeviceService.getCurrentDevice();
        
        if (currentDevice && currentDevice.device_code) {
          setDeviceCode(currentDevice.device_code);
          return;
        }

        // 如果没有当前设备，创建一个新的
        const deviceId = DeviceService.getOrCreateLocalDeviceId();
        const registeredDevice = await DeviceService.registerCurrentDevice(deviceId);
        
        if (registeredDevice && registeredDevice.device_code) {
          setDeviceCode(registeredDevice.device_code);
        } else {
          console.error('Failed to get device code');
        }
      } catch (error) {
        console.error('Error initializing device code:', error);
      }
    };

    initializeDeviceCode();
  }, []);

  return deviceCode;
}
