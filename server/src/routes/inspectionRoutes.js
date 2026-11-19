import express from "express";
import {
  listInspections,
  getInspectionSummary,
  getInspection,
  deleteInspection,
} from "../controllers/inspectionController.js";

const router = express.Router();

router.get("/", listInspections);
router.get("/summary", getInspectionSummary);
router.get("/:id", getInspection);
router.delete("/:id", deleteInspection);

export default router;