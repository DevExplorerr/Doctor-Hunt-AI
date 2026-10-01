const dotenv = require("dotenv");

dotenv.config();

module.exports = {
    alibaba: {
        endpoint: process.env.ALIBABA_ENDPOINT,
        apiKey: process.env.ALIBABA_API_KEY,
        model: process.env.ALIBABA_MODEL || "qwen-max",
        // Structured JSON output requires support from the configured model.
        // Disable it for triage with ALIBABA_JSON_MODE=false if unsupported.
        jsonMode: process.env.ALIBABA_JSON_MODE !== "false",
    },
    server: {
        port: parseInt(process.env.PORT, 10) || 3000,
    },
    session: {
        maxTurns: 8,
        maxHistoryMessages: 20,
        expiryMs: 30 * 60 * 1000,
    },
    rateLimit: {
        maxRequestsPerMinute: 10,
    },
    temperature: 0.3,
};
