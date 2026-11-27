import "./config/env.js";  
import express from "express";
import cors from "cors";
import http from "http";

import connectDB from "./config/database.js";
import Inspection from "./models/Inspection.js";
import { initializeSocket } from "./sockets/socket.js";
import errorHandler from "./middleware/errorHandler.js";
import notFound from "./middleware/notFound.js";

import videoRoutes from "./routes/videoRoutes.js";
import processingRoutes from "./routes/processingRoutes.js";
import inspectionRoutes from "./routes/inspectionRoutes.js";

const app = express();
const httpServer = http.createServer(app);

// ==========================================
// 1. GLOBAL MIDDLEWARE (Must come before routes!)
// ==========================================

// Enable CORS with support for Preflight (OPTIONS) requests
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Added OPTIONS explicitly for preflight
    credentials: true
  })
);

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Helpful for form data/uploads

// ==========================================
// 2. ROUTES
// ==========================================

// Health check root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "ID Detection API is running",
  });
});

app.use("/api/video", videoRoutes);
app.use("/api/processing", processingRoutes);
app.use("/api/inspections", inspectionRoutes);

// Initialize Socket.IO
initializeSocket(httpServer);

app.use(notFound);
app.use(errorHandler);

// ==========================================
// 4. SERVER INITIALISATION
// ==========================================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    // Processing runs in-process, so these jobs cannot resume after this server restarts.
    const recovery = await Inspection.updateMany(
      { status: "processing" },
      {
        $set: {
          status: "failed",
          errorMessage: "Server restarted during processing. Please upload the video again.",
        },
      }
    );
    if (recovery.modifiedCount > 0) {
      console.warn(
        `Marked ${recovery.modifiedCount} interrupted inspection(s) as failed.`
      );
    }

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
