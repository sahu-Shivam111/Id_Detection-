import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRoboflowResult } from "./roboflowResultService.js";

test("re-indexes crop-local company text results by lanyard order", () => {
  const result = normalizeRoboflowResult(
    {
      person_predictions: {
        image: { width: 640, height: 480 },
        predictions: [],
      },
      person_status: [],
      lanyard_color_assessment: [
        {
          lanyard_index: 0,
          box: [10, 20, 30, 60],
          status: "navy_candidate",
        },
        {
          lanyard_index: 1,
          box: [40, 20, 60, 60],
          status: "navy_candidate",
        },
      ],
      company_text_assessment: [
        [{ lanyard_index: 0, status: "company_text_match", read_text: "ACME" }],
        [{ lanyard_index: 0, status: "text_unreadable", read_text: "" }],
      ],
    },
    1
  );

  assert.deepEqual(
    result.companyTextAssessments.map(({ lanyard_index }) => lanyard_index),
    [0, 1]
  );
  assert.deepEqual(
    result.companyTextAssessments.map(({ status }) => status),
    ["company_text_match", "text_unreadable"]
  );
});
