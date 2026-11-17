const getErrorStatus = (error) => {
  const suppliedStatus = error?.status ?? error?.statusCode;
  if (
    Number.isInteger(suppliedStatus) &&
    suppliedStatus >= 400 &&
    suppliedStatus <= 599
  ) {
    return suppliedStatus;
  }
  if (error?.code === "LIMIT_FILE_SIZE") return 413;
  if (error?.name === "MulterError") return 400;
  return 500;
};

export default function errorHandler(error, _request, response, next) {
  if (response.headersSent) {
    return next(error);
  }

  const status = getErrorStatus(error);
  if (status >= 500) {
    console.error(error?.stack ?? error);
  }
  response.status(status).json({
    success: false,
    message:
      status < 500
        ? error?.message || "Request could not be processed."
        : "Internal server error.",
  });
}

export { getErrorStatus };
