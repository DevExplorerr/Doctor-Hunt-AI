const dotenv = require("dotenv");

dotenv.config();

async function callQwen(messages, options = {}) {
    const body = {
        model: options.model || process.env.ALIBABA_MODEL,
        messages,
    };

    if (options.temperature !== undefined) {
        body.temperature = options.temperature;
    }

    // Alibaba Model Studio structured output mode. The requesting model
    // must support it (qwen-plus / qwen-flash do; qwen-plus-character
    // does not). Messages must contain the word "JSON" — the system
    // prompt always does.
    if (options.responseFormat) {
        body.response_format = options.responseFormat;
    }

    const response = await fetch(process.env.ALIBABA_ENDPOINT, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.ALIBABA_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `Alibaba API Error ${response.status}: ${errorText}`
        );
    }

    return await response.json();
}

module.exports = {
    callQwen,
};