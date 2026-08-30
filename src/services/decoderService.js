const { callQwen } = require("./qwen");
const { buildDecoderSystemPrompt } = require("../prompts/decoderPrompt");

const VALID_DOCUMENT_TYPES = ["prescription", "lab_report", "medical_document"];
const VALID_CONFIDENCE_LEVELS = ["high", "medium", "low"];

function stripMarkdownFences(text) {
    if (typeof text !== "string") return "";
    return text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
}

function normalizeArray(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item != null);
}

function normalizeString(value) {
    if (typeof value !== "string") return "";
    return value.trim();
}

function normalizeMedication(item) {
    if (item == null || typeof item !== "object") return null;
    return {
        name: normalizeString(item.name),
        purpose: normalizeString(item.purpose),
        dosage: normalizeString(item.dosage),
        frequency: normalizeString(item.frequency),
        duration: normalizeString(item.duration),
        instructions: normalizeString(item.instructions),
    };
}

function normalizeLabFinding(item) {
    if (item == null || typeof item !== "object") return null;
    return {
        testName: normalizeString(item.testName),
        value: normalizeString(item.value),
        unit: normalizeString(item.unit),
        referenceRange: normalizeString(item.referenceRange),
        interpretation: normalizeString(item.interpretation),
        isOutOfRange: Boolean(item.isOutOfRange),
    };
}

function validateAndNormalize(raw) {
    const documentType = VALID_DOCUMENT_TYPES.includes(raw.documentType)
        ? raw.documentType
        : "medical_document";

    const confidence = VALID_CONFIDENCE_LEVELS.includes(raw.confidence)
        ? raw.confidence
        : "medium";

    const medications = normalizeArray(raw.medications)
        .map(normalizeMedication)
        .filter((m) => m && m.name.length > 0);

    const labFindings = normalizeArray(raw.labFindings)
        .map(normalizeLabFinding)
        .filter((f) => f && f.testName.length > 0);

    const keyFindings = normalizeArray(raw.keyFindings)
        .map(normalizeString)
        .filter((s) => s.length > 0);

    const warnings = normalizeArray(raw.warnings)
        .map(normalizeString)
        .filter((s) => s.length > 0);

    return {
        documentType,
        summary: normalizeString(raw.summary) || "Document analysis completed.",
        medications,
        labFindings,
        keyFindings,
        warnings,
        disclaimer:
            normalizeString(raw.disclaimer) ||
            "This analysis is for informational purposes only and is not a substitute for professional medical advice. Please consult your doctor or pharmacist for proper interpretation.",
        confidence,
        readabilityNotes: normalizeString(raw.readabilityNotes),
    };
}

async function analyzeDocument(imageUrl) {
    const systemPrompt = buildDecoderSystemPrompt();

    const messages = [
        { role: "system", content: systemPrompt },
        {
            role: "user",
            content: [
                {
                    type: "image_url",
                    image_url: { url: imageUrl },
                },
                {
                    type: "text",
                    text: "Please analyze this medical document and provide a structured analysis in JSON format.",
                },
            ],
        },
    ];

    const visionModel = process.env.ALIBABA_VISION_MODEL || "qwen-vl-plus";

    const response = await callQwen(messages, {
        model: visionModel,
        temperature: 0.3,
        responseFormat: { type: "json_object" },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error("Qwen returned an empty response.");
    }

    const cleaned = stripMarkdownFences(content);

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        throw new Error("Qwen returned a malformed response. Please try again.");
    }

    return validateAndNormalize(parsed);
}

module.exports = {
    analyzeDocument,
};
