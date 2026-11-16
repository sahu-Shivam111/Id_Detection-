
import mongoose from "mongoose";

const companyMatchImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
);

const companyMatchSchema = new mongoose.Schema(
  {
    personTrackId: { type: Number, required: true },
    frameNumber: { type: Number, required: true },
    timestamp: { type: Number, required: true },
    lanyardColorStatus: { type: String, required: true },
    companyTextStatus: { type: String, required: true },
    companyText: { type: String, default: null },
    evidenceImage: { type: companyMatchImageSchema, default: null },
  },
  { _id: false }
);

const inspectionSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
    },

    video: {
      url: {
        type: String,
        required: true,
      },
     
      publicId: {
        type: String,
        required: true,
      },
    },

     previewVideo: {
  url: { type: String },
  publicId: { type: String },
},

    duration: {
      type: Number,
      default: 0,
    },

    totalFrames: {
      type: Number,
      default: 0,
    },

    processedFrames: {
      type: Number,
      default: 0,
    },

    totalPeople: {
      type: Number,
      default: 0,
    },

    peopleWithId: {
      type: Number,
      default: 0,
    },

    peopleWithoutId: {
      type: Number,
      default: 0,
    },

    possibleBadgeRemovals: {
      type: Number,
      default: 0,
    },

    uncertainPeople: {
      type: Number,
      default: 0,
    },

    companyMatchCount: {
      type: Number,
      default: 0,
    },

    companyMatches: {
      type: [companyMatchSchema],
      default: [],
    },

    countFrameNumber: {
      type: Number,
      default: 0,
    },

    countTimestamp: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },

    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Inspection = mongoose.model("Inspection", inspectionSchema);

export default Inspection;
