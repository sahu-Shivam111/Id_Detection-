import multer from "multer";
import fs from "fs";
import path from "path";

const uploadDirectory = path.resolve("uploads/videos");

fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${extension}`;

    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const isSupportedVideo =
    (file.mimetype === "video/mp4" && extension === ".mp4") ||
    (file.mimetype === "video/webm" && extension === ".webm");

  if (!isSupportedVideo) {
    return cb(new Error("Only MP4 and WebM video files are allowed."));
  }

  cb(null, true);
};

const uploadVideo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 *1024, // 10 MB
  },
});

export default uploadVideo;