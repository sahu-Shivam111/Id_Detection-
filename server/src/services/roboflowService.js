import axios from "axios";
import fs from "fs/promises";

const getWorkflowConfig = () => {
  const { ROBOFLOW_API_URL, ROBOFLOW_API_KEY, ROBOFLOW_WORKSPACE, ROBOFLOW_WORKFLOW } =
    process.env;
  const missing = [];

  if (!ROBOFLOW_API_URL) missing.push("ROBOFLOW_API_URL");
  if (!ROBOFLOW_API_KEY) missing.push("ROBOFLOW_API_KEY");
  if (!ROBOFLOW_WORKSPACE) missing.push("ROBOFLOW_WORKSPACE");
  if (!ROBOFLOW_WORKFLOW) missing.push("ROBOFLOW_WORKFLOW");

  if (missing.length) {
    throw new Error(`Missing Roboflow configuration: ${missing.join(", ")}.`);
  }

  const baseUrl = ROBOFLOW_API_URL.replace(/\/+$/, "");
  const endpoint =
    `${baseUrl}/${encodeURIComponent(ROBOFLOW_WORKSPACE)}` +
    `/workflows/${encodeURIComponent(ROBOFLOW_WORKFLOW)}`;

  return { endpoint, apiKey: ROBOFLOW_API_KEY };
};

const runRoboflowWorkflow = async (framePath) => {
  if (typeof framePath !== "string" || framePath.length === 0) {
    throw new Error("A frame path is required for Roboflow analysis.");
  }

  const image = await fs.readFile(framePath);
  const { endpoint, apiKey } = getWorkflowConfig();

  try {
    const response = await axios.post(
      endpoint,
      {
        inputs: {
          image: {
            type: "base64",
            value: image.toString("base64"),
          },
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 60000,
      }
    );

    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const detail =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;
    throw new Error(
      `Roboflow Workflow request failed${status ? ` (HTTP ${status})` : ""}: ${detail}`
    );
  }
};

export { runRoboflowWorkflow };
