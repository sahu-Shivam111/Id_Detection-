import express from "express";
import { startProcessing } from "../controllers/videoProcessingController.js";

const router = express.Router();
router.post("/:inspectionId/start", startProcessing);

export default router;