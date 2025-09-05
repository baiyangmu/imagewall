import { useState, useEffect } from 'react';

const KEY = 'imagewall_device_id_v1';

export default function useDeviceId() {
  const [deviceId, setDeviceId] = useState(null);

  useEffect(() => {
    let id = localStorage.getItem(KEY);
    if (!id) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) id = crypto.randomUUID();
      else id = 'dev-' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(KEY, id); } catch (e) { console.warn('store device id failed', e); }
    }
    setDeviceId(id);
  }, []);

  return deviceId;
}


