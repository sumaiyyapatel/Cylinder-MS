class AppError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function globalErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  if (err?.code === "P2002") {
    return res.status(409).json({
      error: "Duplicate value violates unique constraint",
      details: err.meta?.target || null,
    });
  }

  if (err?.code === "P2025") {
    return res.status(404).json({ error: "Record not found" });
  }

  const statusCode = err.statusCode || 500;
  const payload = { error: err.message || "Internal server error" };

  if (err.details) {
    payload.details = err.details;
  }

  if (statusCode >= 500) {
    console.error(err.stack || err);
  }

  return res.status(statusCode).json(payload);
}

module.exports = {
  AppError,
  globalErrorHandler,
};
