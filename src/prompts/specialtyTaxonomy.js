const VALID_SPECIALTIES = [
    "Dermatologist",
    "Dentist",
    "General Physician",
    "Surgeon",
    "Orthopedic",
    "Psychologist",
    "Gynecologist",
    "Neurologist",
    "Pediatrician",
    "Cardiologist",
];

const DEFAULT_SPECIALTY = "General Physician";

const SPECIALTY_ROUTING = {
    "Dermatologist":
        "skin, rash, acne, unexplained skin lesions, persistent itching, moles, skin discoloration, eczema, psoriasis",
    "Dentist":
        "tooth pain, gum problems, dental pain, oral/dental complaints, bleeding gums, tooth sensitivity, cavities",
    "General Physician":
        "general symptoms, fever, fatigue, headache, mild infections, unclear symptoms, multiple unrelated symptoms, or cases where the appropriate specialty is uncertain",
    "Surgeon":
        "conditions that clearly appear to require surgical evaluation based on symptoms, lumps, hernias, wounds requiring stitches",
    "Orthopedic":
        "bones, joints, muscles, fractures, back pain, persistent musculoskeletal problems, sprains, joint swelling",
    "Psychologist":
        "mental/emotional concerns, anxiety, depression, stress, insomnia related to mental health, trauma, behavioral issues",
    "Gynecologist":
        "female reproductive/gynecological concerns, menstrual problems, pregnancy-related symptoms, pelvic pain",
    "Neurologist":
        "neurological symptoms such as persistent neurological complaints, seizures, significant numbness/weakness, migraines, dizziness, tingling",
    "Pediatrician":
        "children's medical concerns, infant health, child development issues, childhood illnesses",
    "Cardiologist":
        "heart/cardiovascular-related symptoms requiring specialist evaluation, chest discomfort related to heart, palpitations, irregular heartbeat, high blood pressure symptoms",
};

module.exports = {
    VALID_SPECIALTIES,
    DEFAULT_SPECIALTY,
    SPECIALTY_ROUTING,
};
