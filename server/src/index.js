import { createServer } from 'node:http';
import app from './app.js';
import config from './config/env.js';
import { initSocket } from './sockets/index.js';
import logger from './utils/logger.js';

const server = createServer(app);
initSocket(server);

server.listen(config.port, () => logger.info(`Server listening on port ${config.port}.`));
