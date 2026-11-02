const timestamp = () => new Date().toISOString();

export default {
  info(message) {
    console.info(`[${timestamp()}] INFO ${message}`);
  },
  error(message) {
    console.error(`[${timestamp()}] ERROR ${message}`);
  },
};
