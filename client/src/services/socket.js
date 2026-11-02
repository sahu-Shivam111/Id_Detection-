import { io } from 'socket.io-client';

const socketUrl = import.meta.env.VITE_SOCKET_URL || undefined;
const socket = io(socketUrl, { autoConnect: false, reconnection: true });

export default socket;
