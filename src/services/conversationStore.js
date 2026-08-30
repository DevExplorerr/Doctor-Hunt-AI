const config = require("../config");

const sessions = new Map();

function cleanupExpired() {
    const now = Date.now();

    for (const [id, session] of sessions) {
        if (now - session.lastActivityAt > config.session.expiryMs) {
            sessions.delete(id);
        }
    }
}

function createSession(sessionId, language) {
    const now = Date.now();

    const session = {
        sessionId,
        messages: [],
        createdAt: now,
        lastActivityAt: now,
        language: language || "en",
        turnCount: 0,
    };

    sessions.set(sessionId, session);
    return session;
}

function getSession(sessionId) {
    cleanupExpired();
    return sessions.get(sessionId) || null;
}

function addMessage(sessionId, role, content) {
    const session = sessions.get(sessionId);
    if (!session) return null;

    session.messages.push({ role, content });

    if (session.messages.length > config.session.maxHistoryMessages) {
        const systemMessages = session.messages.filter(
            (m) => m.role === "system"
        );
        const nonSystemMessages = session.messages.filter(
            (m) => m.role !== "system"
        );

        const trimmed = nonSystemMessages.slice(
            -(config.session.maxHistoryMessages - systemMessages.length)
        );

        session.messages = [...systemMessages, ...trimmed];
    }

    session.lastActivityAt = Date.now();
    return session;
}

function incrementTurn(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return 0;

    session.turnCount += 1;
    return session.turnCount;
}

function resetSession(sessionId) {
    sessions.delete(sessionId);
}

module.exports = {
    createSession,
    getSession,
    addMessage,
    incrementTurn,
    resetSession,
};
