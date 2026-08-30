const {
    VALID_SPECIALTIES,
    DEFAULT_SPECIALTY,
} = require("../prompts/specialtyTaxonomy");

const VALID_STAGES = ["collecting", "complete"];
const VALID_URGENCIES = ["normal", "elevated", "urgent", "emergency"];
const VALID_ANSWER_TYPES = ["single_choice", "free_text"];
const MAX_FOLLOW_UP_QUESTIONS = 2;
const MAX_OPTIONS_PER_QUESTION = 5;
const MAX_OPTION_LENGTH = 60;

const FALLBACK_RESPONSE = {
    stage: "collecting",
    aiMessage:
        "I need a little more information about your symptoms before I can suggest the appropriate type of doctor.",
    urgency: "normal",
    specialty: null,
    followUpQuestions: [],
    triage: null,
    homeCare: null,
};

function stripMarkdownFences(text) {
    if (!text || typeof text !== "string") return text;

    let cleaned = text.trim();

    const fenceMatch = cleaned.match(
        /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/
    );
    if (fenceMatch) {
        cleaned = fenceMatch[1].trim();
    }

    return cleaned;
}

function validateSpecialty(specialty) {
    if (specialty === null || specialty === undefined) return null;

    if (typeof specialty !== "string") return DEFAULT_SPECIALTY;

    if (VALID_SPECIALTIES.includes(specialty)) return specialty;

    const lowerInput = specialty.toLowerCase().trim();
    const match = VALID_SPECIALTIES.find(
        (s) => s.toLowerCase() === lowerInput
    );

    return match || DEFAULT_SPECIALTY;
}

/**
 * Validates the structured follow-up question array.
 *
 * Expected shape per item:
 *   { "id": "back_location", "question": "...",
 *     "answerType": "single_choice", "options": ["..."] }
 *
 * Coercions applied (never thrown — invalid items are repaired or dropped):
 * - A plain string item (legacy format) becomes a free_text question.
 * - single_choice with fewer than 2 usable options becomes free_text.
 * - free_text always ends with an empty options array.
 * - At most MAX_FOLLOW_UP_QUESTIONS questions and MAX_OPTIONS_PER_QUESTION
 *   options survive; options are trimmed and length-capped.
 */
function validateFollowUpQuestions(raw) {
    if (!Array.isArray(raw)) return [];

    const questions = [];

    for (const item of raw) {
        if (questions.length >= MAX_FOLLOW_UP_QUESTIONS) break;

        let candidate;
        if (typeof item === "string") {
            candidate = {
                id: null,
                question: item,
                answerType: "free_text",
                options: [],
            };
        } else if (item && typeof item === "object" && !Array.isArray(item)) {
            candidate = item;
        } else {
            continue;
        }

        const question =
            typeof candidate.question === "string"
                ? candidate.question.trim()
                : "";
        if (!question) continue;

        let answerType = VALID_ANSWER_TYPES.includes(candidate.answerType)
            ? candidate.answerType
            : "free_text";

        let options = Array.isArray(candidate.options)
            ? candidate.options
                  .filter(
                      (o) =>
                          typeof o === "string" && o.trim().length > 0
                  )
                  .map((o) => o.trim().slice(0, MAX_OPTION_LENGTH))
                  // A question is never an answer — drop options that are
                  // just the question text repeated back.
                  .filter(
                      (o) => o.toLowerCase() !== question.toLowerCase()
                  )
                  .slice(0, MAX_OPTIONS_PER_QUESTION)
            : [];

        if (answerType === "single_choice") {
            if (options.length < 2) {
                answerType = "free_text";
                options = [];
            }
        } else {
            options = [];
        }

        const id =
            typeof candidate.id === "string" && candidate.id.trim()
                ? candidate.id.trim()
                : `question_${questions.length + 1}`;

        questions.push({ id, question, answerType, options });
    }

    return questions;
}

function validateResponse(rawContent) {
    try {
        const cleaned = stripMarkdownFences(rawContent);
        const parsed = JSON.parse(cleaned);

        const result = { ...parsed };

        if (!VALID_STAGES.includes(result.stage)) {
            result.stage = "collecting";
        }

        if (!VALID_URGENCIES.includes(result.urgency)) {
            result.urgency = "normal";
        }

        result.specialty = validateSpecialty(result.specialty);

        if (result.stage === "collecting") {
            result.specialty = null;
        }

        if (result.stage === "complete" && !result.specialty) {
            result.specialty = DEFAULT_SPECIALTY;
        }

        if (!Array.isArray(result.followUpQuestions)) {
            result.followUpQuestions = [];
        }

        result.followUpQuestions = validateFollowUpQuestions(
            result.followUpQuestions
        );

        if (result.stage === "complete") {
            result.followUpQuestions = [];
        }

        if (typeof result.aiMessage !== "string" || !result.aiMessage) {
            result.aiMessage =
                "Based on the information provided, I recommend consulting a " +
                DEFAULT_SPECIALTY +
                ". This is not a diagnosis.";
        }

        if (result.triage !== null && result.triage !== undefined) {
            if (
                typeof result.triage !== "object" ||
                Array.isArray(result.triage)
            ) {
                result.triage = null;
            } else {
                if (!Array.isArray(result.triage.symptomSummary)) {
                    result.triage.symptomSummary = [];
                }
                if (!Array.isArray(result.triage.redFlags)) {
                    result.triage.redFlags = [];
                }
            }
        }

        if (result.stage === "collecting") {
            result.triage = null;
        }

        if (result.stage === "complete" && !result.triage) {
            result.triage = { symptomSummary: [], redFlags: [] };
        }

        if (
            typeof result.homeCare !== "string" &&
            result.homeCare !== null
        ) {
            result.homeCare = null;
        }

        if (result.stage === "collecting") {
            result.homeCare = null;
        }

        return result;
    } catch (error) {
        console.error(
            "Response validation failed, using fallback:",
            error.message
        );
        return { ...FALLBACK_RESPONSE };
    }
}

function validateRequest(body) {
    const errors = [];

    if (!body.sessionId || typeof body.sessionId !== "string") {
        errors.push("sessionId is required and must be a string.");
    }

    if (!body.message || typeof body.message !== "string") {
        errors.push("message is required and must be a string.");
    } else {
        if (body.message.length < 1 || body.message.length > 2000) {
            errors.push(
                "message must be between 1 and 2000 characters."
            );
        }
    }

    if (
        body.language !== undefined &&
        body.language !== "en" &&
        body.language !== "ur"
    ) {
        errors.push('language must be "en" or "ur".');
    }

    return errors;
}

module.exports = {
    validateResponse,
    validateRequest,
    validateFollowUpQuestions,
    stripMarkdownFences,
};
