function errorHandler(err, req, res, next) {
    console.error("Error:", err.message);

    if (res.headersSent) {
        return next(err);
    }

    if (err.status && err.status >= 400 && err.status < 600) {
        return res.status(err.status).json({
            success: false,
            error: err.error || "ERROR",
            message: err.message || "An error occurred.",
        });
    }

    res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again later.",
    });
}

module.exports = errorHandler;
