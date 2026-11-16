import fs from "fs/promises";
import cloudinary from "../config/cloudinary.js";
import Inspection from "../models/Inspection.js";

const uploadVideo = async (req, res) => {
  let cloudinaryPublicId;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select or record an MP4 or WebM video.",
      });
    }

    // Upload video to Cloudinary
    const cloudinaryResult = await cloudinary.uploader.upload(
      req.file.path,
      {
        resource_type: "video",
        folder: "id-detection/videos",
      }
    );

    cloudinaryPublicId = cloudinaryResult.public_id;

    // Create inspection record
    const inspection = await Inspection.create({
      filename: req.file.originalname,

      video: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
      },

      status: "pending",
    });

    return res.status(201).json({
      success: true,
      message: "Video uploaded successfully.",
      data: {
        inspectionId: inspection._id,
        filename: inspection.filename,
        videoUrl: inspection.video.url,
        status: inspection.status,
      },
    });
  } catch (error) {
    // Remove Cloudinary video if database creation failed
    if (cloudinaryPublicId) {
      await cloudinary.uploader.destroy(cloudinaryPublicId, {
        resource_type: "video",
      }).catch(() => {});
    }

    console.error("Video upload error:", error);

    return res.status(500).json({
      success: false,
      message: "Video upload failed.",
      error: error.message,
    });
  } finally {
    // Remove temporary local video
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
  }
};

export { uploadVideo };