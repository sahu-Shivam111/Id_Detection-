import { Server } from "socket.io";

let io;

const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });



  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join-inspection", (inspectionId, ack) => {
  socket.join(`inspection:${inspectionId}`);
  if (typeof ack === "function") ack();
});

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO has not been initialized");
  }

  return io;
};

export { initializeSocket, getIO };