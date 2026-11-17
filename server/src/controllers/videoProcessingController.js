import mongoose from "mongoose";
import Inspection from "../models/Inspection.js";
import { processInspection } from "../services/inspectionProcessingService.js";

const startProcessing = async (req, res) => {
  try {
    const { inspectionId } = req.params;

    if (!mongoose.isValidObjectId(inspectionId)) {
      return res.status(400).json({ success: false, message: "Invalid inspection ID." });
    }

    // Atomic: only a "pending" inspection can be started, so it can't run twice
    const inspection = await Inspection.findOneAndUpdate(
      { _id: inspectionId, status: "pending" },
      { status: "processing", errorMessage: null, processedFrames: 0 },
      { returnDocument: "after" }
    );

    if (!inspection) {
      return res.status(409).json({
        success: false,
        message: "Inspection not found, or it was already started.",
      });
    }

    // Respond now; processing continues in the background
    res.status(202).json({
      success: true,
      message: "Processing started.",
      data: { inspectionId: inspection._id, status: inspection.status },
    });

    console.log(`Starting processing for inspection ${inspection._id}.`);
    processInspection(inspection._id).catch((e) => console.error(e));
  } catch (error) {
    console.error("Start processing error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export { startProcessing };