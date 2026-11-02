import { Server } from 'socket.io';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { registerFrameHandler } from './frame.handler.js';

export function initSocket(server) {
  const io = new Server(server, {
    cors: { origin: config.clientOrigin, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 5 * 1024 * 1024,
  });

  io.on('connection', (socket) => {
    logger.info(`Video analyzer connected: ${socket.id}`);
    registerFrameHandler(socket);
    socket.on('disconnect', (reason) => logger.info(`Video analyzer disconnected (${reason}).`));
  });

  return io;
}
