import express from "express";
import {
  listInspections,
  getInspection,
  deleteInspection,
} from "../controllers/inspectionController.js";

const router = express.Router();

router.get("/", listInspections);
router.get("/:id", getInspection);
router.delete("/:id", deleteInspection);

export default router;