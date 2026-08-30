const config = require("../config");

const requestCounts = new Map();

function rateLimiter(req, res, next) {
    const sessionId = req.body?.sessionId || req.ip;
    const now = Date.now();
    const oneMinute = 60 * 1000;

    if (!requestCounts.has(sessionId)) {
        requestCounts.set(sessionId, []);
    }

    const timestamps = requestCounts
        .get(sessionId)
        .filter((t) => now - t < oneMinute);

    requestCounts.set(sessionId, timestamps);

    if (timestamps.length >= config.rateLimit.maxRequestsPerMinute) {
        return res.status(429).json({
            success: false,
            error: "RATE_LIMITED",
            message:
                "Too many requests. Please wait a moment before trying again.",
        });
    }

    timestamps.push(now);
    next();
}

setInterval(() => {
    const now = Date.now();
    const oneMinute = 60 * 1000;

    for (const [key, timestamps] of requestCounts) {
        const valid = timestamps.filter((t) => now - t < oneMinute);
        if (valid.length === 0) {
            requestCounts.delete(key);
        } else {
            requestCounts.set(key, valid);
        }
    }
}, 5 * 60 * 1000);

module.exports = rateLimiter;
