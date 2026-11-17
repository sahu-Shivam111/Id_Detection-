// services/roboflowResultService.js

const STATUS_MAP = Object.freeze({
  id_visible: "visible",
  visible: "visible",
  id_not_visible: "not_visible",
  not_visible: "not_visible",
  unknown: "unknown",
  uncertain: "unknown",
});

/**
 * Accepts:
 *   - { outputs: [workflowOutput] }
 *   - { frameId, outputs: workflowOutput }
 *   - [workflowOutput]
 *   - workflowOutput
 *   - an Axios response containing one of the above in response.data
 *
 * This service processes one image per request, so multiple output items
 * are rejected rather than silently ignored.
 */
function getWorkflowOutput(response) {
  let value = response;

  for (let depth = 0; depth < 5; depth++) {
    if (!value || typeof value !== "object") break;

    if (!Array.isArray(value) && value.data !== undefined) {
      value = value.data;
      continue;
    }

    if (!Array.isArray(value) && Array.isArray(value.frames)) {
      if (value.frames.length !== 1) {
        throw new Error(
          `Expected one Workflow frame for one image; received ${value.frames.length}. ` +
            "Process video-export frames individually."
        );
      }
      value = value.frames[0];
      continue;
    }

    if (!Array.isArray(value) && value.outputs !== undefined) {
      value = value.outputs;
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length !== 1) {
        throw new Error(
          `Expected one Workflow output for one frame; received ${value.length}.`
        );
      }
      value = value[0];
      continue;
    }

    return value;
  }

  throw new Error("Invalid or excessively nested Roboflow Workflow response.");
}

const flattenValues = (value) =>
  Array.isArray(value) ? value.flatMap(flattenValues) : [value];

const assessmentList = (value, fieldName) => {
  if (value == null) return [];

  const flattened = flattenValues(value);
  const invalid = flattened.filter(
    (item) => !item || typeof item !== "object" || Array.isArray(item)
  );
  if (invalid.length) {
    console.warn(
      `Workflow response has ${invalid.length} invalid item(s) in ${fieldName}; ignoring them.`
    );
  }
  return flattened.filter(
    (item) => item && typeof item === "object" && !Array.isArray(item)
  );
};

const primitiveList = (value, expectedType, fieldName) => {
  if (value == null) return [];

  const flattened = flattenValues(value);
  const valid = flattened.filter((item) => typeof item === expectedType);
  if (valid.length !== flattened.length) {
    console.warn(
      `Workflow response has invalid value(s) in ${fieldName}; ignoring them.`
    );
  }
  return valid;
};

const companySignalLabel = (signal) => {
  if (!signal || typeof signal !== "object") return null;

  const hasLanyard =
    Array.isArray(signal.lanyard_indices) && signal.lanyard_indices.length > 0;
  const colorMatch = signal.company_signal === "name_and_color_match";
  const textMatch =
    colorMatch || signal.company_signal === "printed_name_match";
  const colorCandidate =
    colorMatch || signal.company_signal === "color_candidate";
  const textStatus =
    typeof signal.company_text_status === "string"
      ? signal.company_text_status
      : "text_unreadable";

  if (colorMatch) return "Lanyard: navy + text match";
  if (textMatch) return "Lanyard: company text match";
  if (colorCandidate) {
    return textStatus === "text_unreadable"
      ? "Lanyard: navy candidate · text unreadable"
      : "Lanyard: navy candidate";
  }
  if (!hasLanyard) return null;
  if (textStatus === "partial_match") return "Lanyard: partial text match";
  if (textStatus === "company_text_unmatched") return "Lanyard: text no match";
  if (textStatus === "text_unreadable") return "Lanyard: text unreadable";
  return null;
};

function normalizeOutputImage(image) {
  if (!image) return null;

  // Current Workflow output usually has { type: "base64", value: "..." }.
  if (
    typeof image === "object" &&
    image.type === "base64" &&
    typeof image.value === "string" &&
    image.value.length > 0
  ) {
    return image;
  }

  // Some clients may return a base64 string directly.
  if (typeof image === "string" && image.length > 0) {
    return { type: "base64", value: image };
  }

  // No usable base64 image: the inspection service will use the original.
  return null;
}

const getFrameMetadata = (response) => {
  let value = response;

  for (let depth = 0; depth < 5; depth++) {
    if (!value || typeof value !== "object") return {};
    if (!Array.isArray(value) && value.data !== undefined) {
      value = value.data;
      continue;
    }
    if (!Array.isArray(value) && Array.isArray(value.frames)) {
      if (value.frames.length !== 1) return {};
      value = value.frames[0];
      continue;
    }
    if (!Array.isArray(value) && value.frameId !== undefined) {
      return {
        sourceFrameId: value.frameId,
        videoTimeMs: value.videoTimeMs,
      };
    }
    if (!Array.isArray(value) && value.outputs !== undefined) {
      value = value.outputs;
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length !== 1) return {};
      value = value[0];
      continue;
    }
    return {};
  }

  return {};
};

function normalizeRoboflowResult(response, frameNumber, interval = 1) {
  if (!Number.isInteger(frameNumber) || frameNumber < 1) {
    throw new Error("frameNumber must be a positive integer.");
  }

  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error("interval must be a positive number of seconds.");
  }

  const output = getWorkflowOutput(response);
  const predictionOutput = output.person_predictions;

  if (
    !predictionOutput ||
    typeof predictionOutput !== "object" ||
    !Array.isArray(predictionOutput.predictions)
  ) {
    throw new Error("Workflow response is missing person_predictions.predictions.");
  }

  if (!Array.isArray(output.person_status)) {
    throw new Error("Workflow response is missing person_status.");
  }

  const frameWidth = predictionOutput.image?.width;
  const frameHeight = predictionOutput.image?.height;

  if (
    !Number.isFinite(frameWidth) ||
    !Number.isFinite(frameHeight) ||
    frameWidth <= 0 ||
    frameHeight <= 0
  ) {
    throw new Error("Workflow response has invalid frame dimensions.");
  }

  const predictions = predictionOutput.predictions;
  const statusesByIndex = new Map();

  for (const entry of output.person_status) {
    const index = entry?.person_index;

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= predictions.length ||
      statusesByIndex.has(index)
    ) {
      throw new Error("Workflow response has an invalid or duplicate person_index.");
    }

    statusesByIndex.set(index, entry);
  }

  if (statusesByIndex.size !== predictions.length) {
    console.warn(
      `Frame ${frameNumber}: received ${statusesByIndex.size} person statuses ` +
        `for ${predictions.length} predictions; missing statuses will be unknown.`
    );
  }

  const people = predictions.map((prediction, index) => {
    const { x, y, width, height } = prediction ?? {};

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new Error(`Person ${index} has an invalid bounding box.`);
    }

    const status = statusesByIndex.get(index);

    // A missing or unrecognized status must never become "not visible".
    const rawStatus =
      typeof status?.status === "string"
        ? status.status.trim().toLowerCase().replace(/[\s-]+/g, "_")
        : "";
    const condition = STATUS_MAP[rawStatus] ?? "unknown";

    const confidence =
      Number.isFinite(prediction.confidence) &&
      prediction.confidence >= 0 &&
      prediction.confidence <= 1
        ? prediction.confidence
        : null;

    return {
      condition,

      // This is confidence in the PERSON detection, not in ID status.
      confidence,

      note:
        typeof status?.note === "string"
          ? status.note
          : "ID status unavailable; review required.",

      boundingBox: { x, y, width, height },
      frameWidth,
      frameHeight,
    };
  });

  const badgePredictionOutput = output.badge_predictions;
  const badgePredictions = badgePredictionOutput?.predictions ?? [];
  if (!Array.isArray(badgePredictions)) {
    throw new Error("Workflow response has invalid badge_predictions.predictions.");
  }

  const badges = badgePredictions.map((prediction, index) => {
    const { x, y, width, height } = prediction ?? {};
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new Error(`Badge ${index} has an invalid bounding box.`);
    }

    return {
      boundingBox: { x, y, width, height },
      confidence:
        Number.isFinite(prediction.confidence) &&
        prediction.confidence >= 0 &&
        prediction.confidence <= 1
          ? prediction.confidence
          : null,
    };
  });

  const lanyardColorAssessments = assessmentList(
    output.lanyard_color_assessment,
    "lanyard_color_assessment"
  );
  const companyTextAssessments = assessmentList(
    output.company_text_assessment,
    "company_text_assessment"
  ).map((assessment, lanyardIndex) => ({
    ...assessment,
    lanyard_index: lanyardIndex,
  }));
  if (companyTextAssessments.length !== lanyardColorAssessments.length) {
    console.warn(
      `Frame ${frameNumber}: received ${companyTextAssessments.length} company text ` +
        `results for ${lanyardColorAssessments.length} lanyards; positional matching may be incomplete.`
    );
  }
  const lanyardCompanySignals = assessmentList(
    output.lanyard_company_signals,
    "lanyard_company_signals"
  );
  const personCompanySignals = assessmentList(
    output.person_company_signals,
    "person_company_signals"
  );
  const lanyardVisualAssessments = assessmentList(
    output.lanyard_visual_assessments,
    "lanyard_visual_assessments"
  );
  const lanyardTexts = primitiveList(output.lanyard_text, "string", "lanyard_text");
  const companyTextMatches = primitiveList(
    output.company_text_match,
    "boolean",
    "company_text_match"
  );
  const navyLanyardCandidate =
    typeof output.navy_lanyard_candidate === "boolean"
      ? output.navy_lanyard_candidate
      : primitiveList(
          output.navy_lanyard_candidate,
          "boolean",
          "navy_lanyard_candidate"
        ).some(Boolean);

  const companySignalByPersonIndex = new Map();
  for (const signal of personCompanySignals) {
    const index = signal.person_index;
    if (!Number.isInteger(index) || index < 0 || index >= people.length) {
      console.warn(
        `Frame ${frameNumber}: ignoring person company signal with invalid person_index.`
      );
      continue;
    }
    if (companySignalByPersonIndex.has(index)) {
      console.warn(
        `Frame ${frameNumber}: duplicate person company signal for person ${index}; keeping the first.`
      );
      continue;
    }
    companySignalByPersonIndex.set(index, signal);
  }

  people.forEach((person, index) => {
    const companySignal = companySignalByPersonIndex.get(index) ?? null;
    person.companySignal = companySignal;
    person.companyClueLabel = companySignalLabel(companySignal);
  });

  const counts = {
    totalPeople: people.length,
    idVisible: people.filter((person) => person.condition === "visible").length,
    idNotVisible: people.filter((person) => person.condition === "not_visible").length,
    unknown: people.filter((person) => person.condition === "unknown").length,
  };

  const reportedCounts = {
    totalPeople: output.total_people,
    idVisible: output.id_visible_count,
    idNotVisible: output.id_not_visible_count,
    unknown: output.uncertain_count,
  };

  const hasReportedCounts = Object.values(reportedCounts).some((count) => count !== undefined);
  if (hasReportedCounts) {
    const invalidReportedCounts = Object.values(reportedCounts).some(
      (count) => !Number.isInteger(count) || count < 0
    );
    const countsDisagree = Object.keys(counts).some(
      (key) => reportedCounts[key] !== counts[key]
    );

    if (invalidReportedCounts || countsDisagree) {
      console.warn(
        `Frame ${frameNumber}: workflow count fields do not match person predictions and statuses; using derived counts.`
      );
    }
  }

  const metadata = getFrameMetadata(response);
  const timestamp = Number.isFinite(metadata.videoTimeMs)
    ? metadata.videoTimeMs / 1000
    : (frameNumber - 1) * interval;

  return {
    frameNumber,
    sourceFrameId: metadata.sourceFrameId ?? null,
    timestamp,

    frameWidth,
    frameHeight,
    people,
    badges,
    counts,
    lanyardColorAssessments,
    navyLanyardCandidate,
    lanyardTexts,
    companyTextAssessments,
    companyTextMatches,
    lanyardCompanySignals,
    personCompanySignals,
    lanyardVisualAssessments,
    outputImage: normalizeOutputImage(output.output_image),
  };
}

export { normalizeRoboflowResult };
