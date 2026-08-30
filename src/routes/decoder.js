const express = require("express");
const router = express.Router();

const decoderService = require("../services/decoderService");
const rateLimiter = require("../middleware/rateLimiter");

function isValidUrl(value) {
    if (typeof value !== "string" || value.trim().length === 0) return false;
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

router.post("/analyze", rateLimiter, async (req, res, next) => {
    try {
        const { imageUrl } = req.body || {};

        if (!imageUrl || typeof imageUrl !== "string") {
            return res.status(400).json({
                success: false,
                error: "INVALID_REQUEST",
                message: "imageUrl is required and must be a non-empty string.",
            });
        }

        if (!isValidUrl(imageUrl)) {
            return res.status(400).json({
                success: false,
                error: "INVALID_REQUEST",
                message: "imageUrl must be a valid HTTP or HTTPS URL.",
            });
        }

        const result = await decoderService.analyzeDocument(imageUrl.trim());

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        if (
            error.message &&
            (error.message.includes("Qwen returned") ||
                error.message.includes("Alibaba API Error"))
        ) {
            return res.status(502).json({
                success: false,
                error: "ANALYSIS_FAILED",
                message:
                    "Document analysis is temporarily unavailable. Please try again in a moment.",
            });
        }
        next(error);
    }
});

module.exports = router;
