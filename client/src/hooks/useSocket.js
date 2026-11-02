import { useEffect, useState } from 'react';
import socket from '../services/socket.js';

export default function useSocket() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
    };
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
    };
  }, []);

  return { socket, connected };
}
