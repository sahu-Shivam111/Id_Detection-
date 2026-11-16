import "./config/env.js";  
import express from "express";
import cors from "cors";
import http from "http";

import connectDB from "./config/database.js";
import { initializeSocket } from "./sockets/socket.js";

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
    origin: process.env.CLIENT_URL || "http://localhost:5173",
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

// ==========================================
// 3. SOCKETS & ERROR HANDLING
// ==========================================

// Initialize Socket.IO
initializeSocket(httpServer);

// Error Handling Middleware (Must be registered after routes)
app.use((error, req, res, next) => {
  console.error(error.message);

  res.status(error instanceof Error ? 400 : 500).json({
    success: false,
    message: error.message || "Something went wrong.",
  });
});

// ==========================================
// 4. SERVER INITIALISATION
// ==========================================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
