const { callQwen } = require("./qwen");
const conversationStore = require("./conversationStore");
const { buildSystemPrompt } = require("../prompts/systemPrompt");
const { validateResponse } = require("../validators/responseValidator");
const config = require("../config");

async function processChat(sessionId, message, language = "en") {
    let session = conversationStore.getSession(sessionId);

    if (!session) {
        session = conversationStore.createSession(sessionId, language);

        const systemPrompt = buildSystemPrompt(language);
        conversationStore.addMessage(sessionId, "system", systemPrompt);
    }

    const turnCount = conversationStore.incrementTurn(sessionId);

    const isLastTurn = turnCount >= config.session.maxTurns;

    conversationStore.addMessage(sessionId, "user", message);

    if (isLastTurn) {
        conversationStore.addMessage(
            sessionId,
            "system",
            "This is the final turn. You must now complete the triage with the information available. Set stage to \"complete\" and recommend a specialty. If insufficient information, recommend \"General Physician\"."
        );
    }

    session = conversationStore.getSession(sessionId);
    const apiResult = await callQwen(session.messages, {
        temperature: config.temperature,
        responseFormat: config.alibaba.jsonMode
            ? { type: "json_object" }
            : undefined,
    });

    const rawContent = apiResult.choices?.[0]?.message?.content;

    if (!rawContent) {
        throw Object.assign(
            new Error("No response received from AI service."),
            { status: 502, error: "AI_SERVICE_ERROR" }
        );
    }

    const validated = validateResponse(rawContent);

    conversationStore.addMessage(
        sessionId,
        "assistant",
        JSON.stringify(validated)
    );

    return {
        sessionId,
        language: session.language,
        ...validated,
    };
}

module.exports = {
    processChat,
};
