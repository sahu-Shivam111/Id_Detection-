import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";
import Inspection from "../models/Inspection.js";
import DetectionEvent from "../models/DetectionEvent.js";

const validId = (id) => mongoose.isValidObjectId(id);

// GET /api/inspections?page=1&limit=10&status=completed
const listInspections = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const filter = {};
    if (["pending", "processing", "completed", "failed"].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const [items, total] = await Promise.all([
      Inspection.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Inspection.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/inspections/:id  (inspection + its missing-ID events)
const getInspection = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validId(id)) {
      return res.status(400).json({ success: false, message: "Invalid inspection ID." });
    }

    const inspection = await Inspection.findById(id).lean();
    if (!inspection) {
      return res.status(404).json({ success: false, message: "Inspection not found." });
    }

    const events = await DetectionEvent.find({ inspection: id })
      .sort({ timestamp: 1 })
      .lean();

    res.json({ success: true, data: { inspection, events } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/inspections/:id
const deleteInspection = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validId(id)) {
      return res.status(400).json({ success: false, message: "Invalid inspection ID." });
    }

    const inspection = await Inspection.findById(id);
    if (!inspection) {
      return res.status(404).json({ success: false, message: "Inspection not found." });
    }
    if (inspection.status === "processing") {
      return res.status(409).json({
        success: false,
        message: "Cannot delete while processing is running.",
      });
    }

    const events = await DetectionEvent.find({ inspection: id }).lean();
    const imageIds = events.flatMap((e) => [
      e.originalImage?.publicId,
      e.annotatedImage?.publicId,
      e.lastIdVisibleImage?.publicId,
    ])
      .concat(
        (inspection.companyMatches || []).map(
          (match) => match.evidenceImage?.publicId
        )
      )
      .filter(Boolean);

    // Remove Cloudinary files first; failures are logged, not fatal
    await Promise.allSettled([
  cloudinary.uploader.destroy(inspection.video.publicId, { resource_type: "video" }),
  ...(inspection.previewVideo?.publicId
    ? [cloudinary.uploader.destroy(inspection.previewVideo.publicId, { resource_type: "video" })]
    : []),
  ...imageIds.map((pid) => cloudinary.uploader.destroy(pid)),
]);

    await DetectionEvent.deleteMany({ inspection: id });
    await inspection.deleteOne();

    res.json({ success: true, message: "Inspection deleted." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export { listInspections, getInspection, deleteInspection };