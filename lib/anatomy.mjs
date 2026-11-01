// Advanced Anatomy & Spatial Reasoning extension (schema v2.0).
//
// Design goals:
//  - Fully backward compatible: every existing consumer only reads
//    summary/sections/evidence/prompt from the v1 contract. The advanced
//    fields below are OPTIONAL and additive ("advanced": true marker), so
//    old results stay valid and new results carry extra structured detail.
//  - Evidence-grounded: visibility states force the model to separate what
//    is seen from what is occluded, outside the frame, or uncertain.
//  - Bounded output: hard caps on subjects/regions/attributes keep token
//    usage predictable for the local 4B model.

export const ADVANCED_SCHEMA_VERSION = "2.0";

export const VISIBILITY_STATES = [
  "visible",
  "partially_visible",
  "occluded",
  "outside_frame",
  "uncertain",
];

export const ANATOMY_REGIONS = [
  // A. Head and face
  "head", "face", "hair", "forehead", "eyebrows", "eyes", "nose", "mouth",
  "cheeks", "chin", "jawline", "ears", "neck", "facial_hair",
  // B. Upper body
  "shoulders", "clavicles", "upper_arms", "elbows", "forearms", "wrists",
  "hands", "fingers", "armpits", "chest", "abdomen", "waist", "back",
  "muscle_definition", "skin_upper",
  // C. Lower body
  "pelvis", "hips", "thighs", "knees", "calves", "ankles", "heels", "feet",
  "toes", "skin_lower",
  // D. General / non-anatomical fallbacks
  "body_silhouette", "accessory", "other",
];

export const ADVANCED_CAPS = {
  maxSubjects: 6,
  maxRegionsPerSubject: 12,
  maxAttributes: 6,
  maxRelationships: 8,
  maxVerified: 10,
  maxUncertainList: 8,
  textLimit: 300,
};

const str = (maxLen = ADVANCED_CAPS.textLimit) => ({
  type: "string",
  minLength: 1,
  maxLength: maxLen,
});
const nullableStr = () => ({ anyOf: [{ type: "null" }, str(240)] });

const anatomyEntrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["region", "visibility", "description"],
  properties: {
    region: { type: "string", enum: ANATOMY_REGIONS },
    visibility: { type: "string", enum: VISIBILITY_STATES },
    attributes: {
      type: "array",
      maxItems: ADVANCED_CAPS.maxAttributes,
      items: str(160),
    },
    description: str(),
    evidence: nullableStr(),
    uncertainty: nullableStr(),
  },
};

/**
 * Additive properties merged into DESCRIPTION_SCHEMA when a request carries
 * `advanced: true`. When it does not, the schema stays exactly the v1
 * contract, so existing frontend consumers and cloud callers are untouched.
 */
export const ADVANCED_PROPERTIES = {
  schema_version: { type: "string", enum: [ADVANCED_SCHEMA_VERSION] },
  advanced: { type: "boolean" },
  subjects: {
    type: "array",
    minItems: 1,
    maxItems: ADVANCED_CAPS.maxSubjects,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["id", "subject_type", "pose", "anatomy"],
      properties: {
        id: { type: "string", pattern: "^subject_[0-9]+$" },
        subject_type: {
          type: "string",
          enum: ["person", "animal", "object", "figure_or_character", "other"],
        },
        pose: {
          type: "object",
          additionalProperties: false,
          required: ["orientation", "description"],
          properties: {
            orientation: str(200),
            description: str(),
          },
        },
        anatomy: {
          type: "array",
          minItems: 1,
          maxItems: ADVANCED_CAPS.maxRegionsPerSubject,
          items: anatomyEntrySchema,
        },
      },
    },
  },
  spatial_relationships: {
    type: "array",
    maxItems: ADVANCED_CAPS.maxRelationships,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["description"],
      properties: {
        between: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: { type: "string", pattern: "^(?:subject_[0-9]+|background)$" },
        },
        description: str(),
      },
    },
  },
  verified_observations: {
    type: "array",
    maxItems: ADVANCED_CAPS.maxVerified,
    items: str(240),
  },
  uncertain_observations: {
    type: "array",
    maxItems: ADVANCED_CAPS.maxUncertainList,
    items: str(240),
  },
};

// Non-enum instructions kept out of the JSON schema so the constrained
// decoder never has to parse them; they live in the system/user prompts.
export const ADVANCED_PROMPT_GUIDANCE = `Advanced anatomy mode is enabled for this request. In addition to the standard fields, fill the optional fields:
Set "advanced" to true and "schema_version" to "${ADVANCED_SCHEMA_VERSION}".
List one entry per clearly visible person, animal or main object in "subjects" with stable ids subject_1, subject_2... Assign each visible head, torso, arm, hand, leg and foot to its owning subject; when ownership of a limb is ambiguous say so in that entry's uncertainty instead of guessing.
For each subject report only anatomical regions that are relevant and actually assessable, each with a visibility state: visible, partially_visible, occluded, outside_frame or uncertain. Use neutral clinical terms. Never invent features of occluded or out-of-frame regions, and never add a region merely because it appears in a checklist. Do not infer age, medical condition, internal anatomy, identity, ethnicity or private emotional states. Describe intimate areas only neutrally and clinically when plainly depicted; otherwise mark them outside_frame or omit them.
Pose entries must use geometric language: supported or unsupported, lying versus reclining at an angle, extended versus bent limbs, raised versus lowered limbs, torso rotation, and image-left/image-right placement. Prefer an angled/diagonal description over forcing a body into horizontal or vertical. State framing honestly: if feet, legs or any part is cut by the image edge, say partially framed, never full-body.
Distinguish anatomical left/right from image-left/image-right; when the mapping is unclear use image-side wording and record the ambiguity in uncertainty.
spatial_relationships lists observable contact, overlap and relative placement between subjects or between a subject and the background, without inventing actions or intentions. Each entry is an object: {"between": ["subject_1", "background"], "description": "one factual sentence"} where every reference is subject_N or "background".
verified_observations repeats only claims you re-checked against the image after drafting (left/right sides, straight versus bent limbs, framing completeness, lighting direction). uncertain_observations records meaningful ambiguities with calibrated wording.`;

// Targeted verification pass: re-inspect the highest-error claim classes.
export const VERIFICATION_SYSTEM_PROMPT = `You are a strict visual fact-checker for image descriptions. You receive one image and a JSON draft description. Re-examine the image and check ONLY these claim classes:
1. anatomical left versus image left, and limb ownership when subjects overlap;
2. straight or extended limbs versus bent limbs;
3. body orientation (standing, sitting, lying, reclining, diagonal) and support;
4. full framing versus partial framing cut by the image edge;
5. visible versus occluded or out-of-frame anatomy;
6. lighting direction and background elements.
Return JSON only, matching the given schema. For each draft claim that belongs to these classes output verdict "supported" when the image directly shows it, "uncertain" when it cannot be confirmed, or "unsupported" when the image contradicts it or gives no evidence. Copy each claim verbatim into "claim". Keep corrections short, literal and English-only. Do not add new descriptive content and do not repeat instructions as observations.`;

export const VERIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["checks"],
  properties: {
    checks: {
      type: "array",
      maxItems: 14,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "verdict", "note"],
        properties: {
          claim: str(240),
          verdict: { type: "string", enum: ["supported", "uncertain", "unsupported"] },
          note: str(200),
        },
      },
    },
  },
};

const normalized = (text) => String(text).toLowerCase().replace(/\s+/g, " ").trim();
const HEDGE = /\b(?:may\s+be|might|could\s+be|possibly|probably|appears?\s+to|seems?\s+to|unclear|ambiguous|cannot\s+be\s+determined)\b/i;

function requireAdvText(value, where) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`advanced_validation: ${where} must be a non-empty string`);
  }
  if (value.length > 600) throw new TypeError(`advanced_validation: ${where} is too long`);
  const letters = value.match(/\p{L}/gu) || [];
  const latin = value.match(/\p{Script=Latin}/gu) || [];
  if (letters.length > 5 && latin.length / letters.length < 0.65) {
    throw new TypeError(`advanced_validation: ${where} is not English`);
  }
}

/**
 * Validate the optional v2.0 advanced fields of a description.
 * Throws TypeError with an `advanced_validation:` prefix on structural
 * problems so callers can decide whether to degrade gracefully or fail.
 * Returns a sanitized copy (extra keys dropped, arrays capped).
 */
export function validateAdvanced(result) {
  if (!result || typeof result !== "object") throw new TypeError("advanced_validation: result missing");
  if (result.advanced !== true) return null; // v1 result — nothing to validate
  if (result.schema_version !== ADVANCED_SCHEMA_VERSION) {
    throw new TypeError(`advanced_validation: unexpected schema_version ${String(result.schema_version)}`);
  }
  if (!Array.isArray(result.subjects) || result.subjects.length < 1 || result.subjects.length > ADVANCED_CAPS.maxSubjects) {
    throw new TypeError("advanced_validation: subjects must be a non-empty bounded array");
  }
  const ids = new Set();
  const subjects = result.subjects.map((subject, index) => {
    if (!subject || typeof subject !== "object") throw new TypeError(`advanced_validation: subject ${index} malformed`);
    const expectedId = `subject_${index + 1}`;
    if (subject.id !== expectedId || ids.has(subject.id)) {
      throw new TypeError(`advanced_validation: subject ids must be stable and sequential (${expectedId})`);
    }
    ids.add(subject.id);
    if (!["person", "animal", "object", "figure_or_character", "other"].includes(subject.subject_type)) {
      throw new TypeError(`advanced_validation: ${expectedId} has unknown subject_type`);
    }
    if (!subject.pose || typeof subject.pose !== "object") throw new TypeError(`advanced_validation: ${expectedId} missing pose`);
    requireAdvText(subject.pose.orientation, `${expectedId}.pose.orientation`);
    requireAdvText(subject.pose.description, `${expectedId}.pose.description`);
    if (!Array.isArray(subject.anatomy) || subject.anatomy.length < 1 || subject.anatomy.length > ADVANCED_CAPS.maxRegionsPerSubject) {
      throw new TypeError(`advanced_validation: ${expectedId}.anatomy must be a bounded non-empty array`);
    }
    const seenRegions = new Set();
    const anatomy = subject.anatomy.map((entry) => {
      if (!entry || typeof entry !== "object") throw new TypeError(`advanced_validation: ${expectedId} anatomy entry malformed`);
      if (!ANATOMY_REGIONS.includes(entry.region)) throw new TypeError(`advanced_validation: unknown region ${String(entry.region)}`);
      if (seenRegions.has(entry.region)) throw new TypeError(`advanced_validation: duplicate region ${entry.region} in ${expectedId}`);
      seenRegions.add(entry.region);
      if (!VISIBILITY_STATES.includes(entry.visibility)) throw new TypeError(`advanced_validation: invalid visibility ${String(entry.visibility)}`);
      requireAdvText(entry.description, `${expectedId}.${entry.region}.description`);
      const attributes = Array.isArray(entry.attributes) ? entry.attributes.slice(0, ADVANCED_CAPS.maxAttributes) : [];
      attributes.forEach((item) => requireAdvText(item, `${expectedId}.${entry.region}.attribute`));
      for (const optional of ["evidence", "uncertainty"]) {
        const value = entry[optional];
        if (value !== null && value !== undefined) requireAdvText(value, `${expectedId}.${entry.region}.${optional}`);
      }
      if (entry.visibility === "visible" && HEDGE.test(entry.description) && !entry.uncertainty) {
        throw new TypeError(`advanced_validation: ${expectedId}.${entry.region} hedged as visible without uncertainty note`);
      }
      if ((entry.visibility === "occluded" || entry.visibility === "outside_frame") &&
          /\b(?:wearing|has|with|shows?)\b[^.]{0,40}\b(?:garment|shirt|t-?shirt|blouse|top|dress|skirt|jeans|trousers|pants|shorts|socks|shoes|boots|jacket|coat|uniform|bra|underwear)\b/i.test(entry.description)) {
        throw new TypeError(`advanced_validation: ${expectedId}.${entry.region} invents hidden detail`);
      }
      return {
        region: entry.region,
        visibility: entry.visibility,
        attributes,
        description: entry.description.trim(),
        evidence: entry.evidence ?? null,
        uncertainty: entry.uncertainty ?? null,
      };
    });
    return {
      id: subject.id,
      subject_type: subject.subject_type,
      pose: { orientation: subject.pose.orientation.trim(), description: subject.pose.description.trim() },
      anatomy,
    };
  });

  const relationships = Array.isArray(result.spatial_relationships)
    ? result.spatial_relationships.slice(0, ADVANCED_CAPS.maxRelationships).map((item) => {
        if (!item || typeof item !== "object") throw new TypeError("advanced_validation: spatial_relationships entry malformed");
        requireAdvText(item.description, "spatial_relationships.description");
        const between = Array.isArray(item.between)
          ? item.between.filter((ref) => /^(?:subject_[0-9]+|background)$/.test(String(ref))).slice(0, 3)
          : [];
        for (const ref of between) {
          if (ref !== "background" && !ids.has(ref)) throw new TypeError(`advanced_validation: unknown subject reference ${ref}`);
        }
        return { between, description: item.description.trim() };
      })
    : [];

  const listField = (name, limit) => Array.isArray(result[name])
    ? result[name].slice(0, limit).map((item) => { requireAdvText(item, `${name}[]`); return item.trim(); })
    : [];
  const verified = listField("verified_observations", ADVANCED_CAPS.maxVerified);
  const uncertainList = listField("uncertain_observations", ADVANCED_CAPS.maxUncertainList);
  if (verified.some((item) => HEDGE.test(item))) {
    throw new TypeError("advanced_validation: hedged wording inside verified_observations");
  }
  const unconfirmed = new Set([...uncertainList, ...subjects.flatMap((s) => s.anatomy.filter((a) => a.visibility === "uncertain").map((a) => normalized(a.description)))].map(normalized));
  for (const claim of [...verified, ...subjects.flatMap((s) => s.anatomy.filter((a) => a.visibility === "visible").map((a) => a.description))]) {
    if (unconfirmed.has(normalized(claim))) throw new TypeError("advanced_validation: same claim both confirmed and uncertain");
  }

  return {
    schema_version: ADVANCED_SCHEMA_VERSION,
    advanced: true,
    subjects,
    spatial_relationships: relationships,
    verified_observations: verified,
    uncertain_observations: uncertainList,
  };
}

/**
 * Apply a spatial-verification pass (Pass 3/4) to a validated description.
 * Unsupported claims are removed from confirmed evidence and recorded as
 * calibrated uncertainty instead of silently staying asserted.
 */
export function applyVerificationChecks(description, checks) {
  if (!Array.isArray(checks)) return { description, applied: 0 };
  let applied = 0;
  const demoted = [];
  const confirmed = description.evidence.confirmed.filter((claim) => {
    const hit = checks.find((check) => normalized(check.claim) === normalized(claim) || normalized(claim).includes(normalized(check.claim)));
    if (!hit) return true;
    if (hit.verdict === "supported") { applied += 1; return true; }
    applied += 1;
    if (hit.verdict === "unsupported") {
      demoted.push(`Possibly inaccurate on re-inspection: ${claim.replace(/[.]?$/, "")} — verification note: ${hit.note}`);
      return false;
    }
    demoted.push(`${claim.replace(/[.]?$/, "")} (flagged uncertain by spatial verification: ${hit.note})`);
    return false;
  });
  const uncertain = [...new Set([...description.evidence.uncertain, ...demoted])].slice(0, 6);
  const next = { ...description, evidence: { confirmed, uncertain } };
  if (next.advanced === true) {
    next.verified_observations = checks.filter((c) => c.verdict === "supported").map((c) => c.claim).slice(0, ADVANCED_CAPS.maxVerified);
    next.uncertain_observations = uncertain;
  }
  return { description: next, applied };
}
