import express from "express";
import uploadVideo from "../middleware/uploadMiddleware.js";
import { uploadVideo as uploadVideoController } from "../controllers/videoController.js";

const router = express.Router();

router.post(
  "/upload",
  uploadVideo.single("video"),
  uploadVideoController
);

export default router;