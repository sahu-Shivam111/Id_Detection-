import test from "node:test";
import assert from "node:assert/strict";
import errorHandler, { getErrorStatus } from "./errorHandler.js";

test("classifies unexpected errors as server errors", () => {
  assert.equal(getErrorStatus(new Error("database unavailable")), 500);
});

test("preserves explicit client statuses and maps multer errors", () => {
  assert.equal(getErrorStatus(Object.assign(new Error("invalid file"), { status: 400 })), 400);
  assert.equal(getErrorStatus({ name: "MulterError", code: "LIMIT_FILE_SIZE" }), 413);
  assert.equal(getErrorStatus({ name: "MulterError", code: "LIMIT_UNEXPECTED_FILE" }), 400);
});

test("does not expose internal error messages", () => {
  let responseStatus;
  let responseBody;
  const response = {
    status(status) {
      responseStatus = status;
      return this;
    },
    json(body) {
      responseBody = body;
    },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    errorHandler(new Error("sensitive internal details"), {}, response, () => {});
  } finally {
    console.error = originalError;
  }

  assert.equal(responseStatus, 500);
  assert.deepEqual(responseBody, {
    success: false,
    message: "Internal server error.",
  });
});
