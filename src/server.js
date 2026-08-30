const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const { callQwen } = require("./services/qwen");
const triageRoutes = require("./routes/triage");
const decoderRoutes = require("./routes/decoder");
const errorHandler = require("./middleware/errorHandler");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Doctor Hunt AI backend is running.",
    });
});

// Lightweight unauthenticated liveness probe for Render health checks.
// Intentionally does not call the Alibaba API so a third-party outage
// never causes the platform to restart the service.
app.get("/health", (req, res) => {
    res.json({ success: true, status: "ok" });
});

app.get("/api/test-qwen", async (req, res) => {
    try {
        const result = await callQwen([
            {
                role: "user",
                content: "Reply with exactly: Doctor Hunt AI backend is connected.",
            },
        ]);

        res.json({
            success: true,
            message: result.choices[0].message.content,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Failed to connect to Qwen.",
        });
    }
});

app.use("/api/triage", triageRoutes);
app.use("/api/decoder", decoderRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Bind explicitly to 0.0.0.0 so the service is reachable on Render's
// proxy (localhost-only binding would fail the platform health check).
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Doctor Hunt AI backend running on http://localhost:${PORT}`);
});
