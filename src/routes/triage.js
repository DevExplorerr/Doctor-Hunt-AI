const express = require("express");
const router = express.Router();

const triageService = require("../services/triageService");
const conversationStore = require("../services/conversationStore");
const { validateRequest } = require("../validators/responseValidator");
const rateLimiter = require("../middleware/rateLimiter");

router.post("/chat", rateLimiter, async (req, res, next) => {
    try {
        const errors = validateRequest(req.body);
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: "INVALID_REQUEST",
                messages: errors,
            });
        }

        const { sessionId, message, language = "en" } = req.body;

        const result = await triageService.processChat(
            sessionId,
            message,
            language
        );

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

router.post("/reset", async (req, res, next) => {
    try {
        const { sessionId } = req.body;

        if (!sessionId || typeof sessionId !== "string") {
            return res.status(400).json({
                success: false,
                error: "INVALID_REQUEST",
                message: "sessionId is required and must be a string.",
            });
        }

        const session = conversationStore.getSession(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: "SESSION_NOT_FOUND",
                message: "No active session found for the provided sessionId.",
            });
        }

        conversationStore.resetSession(sessionId);

        res.json({
            success: true,
            message: "Session reset successfully.",
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
