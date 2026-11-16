
import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },

    publicId: {
      type: String,
      required: true,
    },
  },
  {
    _id: false,
  }
);

const boundingBoxSchema = new mongoose.Schema(
  {
    x: {
      type: Number,
      required: true,
    },

    y: {
      type: Number,
      required: true,
    },

    width: {
      type: Number,
      required: true,
    },

    height: {
      type: Number,
      required: true,
    },
  },
  {
    _id: false,
  }
);

const detectionEventSchema = new mongoose.Schema(
  {
    inspection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inspection",
      required: true,
    },

    personTrackId: {
      type: Number,
      default: null,
    },

    timestamp: {
      type: Number,
      required: true,
    },

    frameNumber: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["not_visible"],
      default: "not_visible",
    },

    reason: {
      type: String,
      enum: ["no_badge_on_entry", "possible_badge_removal"],
      default: "no_badge_on_entry",
    },

    confirmed: {
      type: Boolean,
      default: true,
    },

    resolved: {
      type: Boolean,
      default: false,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    originalImage: {
      type: imageSchema,
      required: true,
    },

    annotatedImage: {
      type: imageSchema,
      required: true,
    },

    lastIdVisibleImage: {
      type: imageSchema,
      default: null,
    },

    lastIdVisibleFrameNumber: {
      type: Number,
      default: null,
    },

    lastIdVisibleTimestamp: {
      type: Number,
      default: null,
    },

    boundingBox: {
      type: boundingBoxSchema,
      required: true,
    },

    frameWidth: {
      type: Number,
      required: true,
    },

    frameHeight: {
      type: Number,
      required: true,
    },
    note: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

detectionEventSchema.index({ inspection: 1, timestamp: 1 });

const DetectionEvent = mongoose.model(
  "DetectionEvent",
  detectionEventSchema
);

export default DetectionEvent;
