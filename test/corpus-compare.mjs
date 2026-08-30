/**
 * Shared comparison for `normalization-corpus.json`, so four implementations judge identically.
 *
 * The corpus asserts what a document SAYS, not merely that it is acceptable. Accept/reject
 * fixtures cannot do that: two parsers can agree a document is valid while disagreeing about its
 * outcomes, and the format's whole promise is that they do not.
 *
 * `project` handles the one difference SPEC.md section 2 explicitly permits. Implementations MAY
 * model verification kinds richly (`{checks: [{kind, description}]}`) as the Pathmode parsers do,
 * but must flatten to an array of strings before validating, because the schema defines no object
 * form. Projecting here is that required flattening, not a concession: a parser that cannot be
 * projected onto these fields has diverged.
 *
 * Fields an implementation adds beyond `comparedFields` are ignored. A parser is free to carry
 * identifiers, source markers, or internal state; it is not free to disagree about the model.
 */

/** Flatten whatever an implementation calls verification into SPEC.md section 2's array form. */
export function flattenVerification(value) {
    if (value == null) return undefined;
    if (Array.isArray(value)) {
        const strings = value.map(v => (typeof v === 'string' ? v : v?.description)).filter(Boolean);
        return strings.length ? strings : undefined;
    }
    if (typeof value !== 'object') return undefined;
    const out = [];
    for (const check of value.checks ?? []) {
        if (typeof check?.description === 'string' && check.description.trim()) out.push(check.description.trim());
    }
    // Legacy buckets some parsers still read; order after canonical checks, as the writers emit.
    for (const bucket of ['manualChecks', 'unitTests', 'e2eTests']) {
        for (const s of value[bucket] ?? []) {
            if (typeof s === 'string' && s.trim()) out.push(s.trim());
        }
    }
    return out.length ? out : undefined;
}

/** Reduce any parser's output to the fields the corpus compares. */
export function project(parsed, comparedFields) {
    const out = {};
    if (!parsed || typeof parsed !== 'object') return out;

    for (const field of comparedFields) {
        if (field === 'verification') {
            const flattened = flattenVerification(parsed.verification);
            if (flattened) out.verification = flattened;
            continue;
        }
        if (field === 'edgeCases') {
            const cases = (parsed.edgeCases ?? [])
                .map(ec => ({
                    scenario: String(ec?.scenario ?? '').trim(),
                    expectedBehavior: String(ec?.expectedBehavior ?? '').trim(),
                }))
                .filter(ec => ec.scenario && ec.expectedBehavior);
            if (cases.length) out.edgeCases = cases;
            continue;
        }
        const value = parsed[field];
        if (value == null) continue;
        if (Array.isArray(value)) {
            const items = value
                .map(v => (typeof v === 'string' ? v : v?.text ?? v?.description ?? ''))
                .map(v => String(v).trim())
                .filter(Boolean);
            if (items.length) out[field] = items;
            continue;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            // 'Untitled Intent' is a parser default for a document with no name, not a title the
            // author wrote. The corpus never expects it, so treat it as absent.
            if (trimmed && trimmed !== 'Untitled Intent') out[field] = trimmed;
        }
    }
    return out;
}

/** @returns {string[]} human-readable differences, empty when the case passes. */
export function diff(expected, actual) {
    const problems = [];
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of keys) {
        const e = JSON.stringify(expected[key]);
        const a = JSON.stringify(actual[key]);
        if (e !== a) problems.push(`${key}: expected ${e ?? '(absent)'}, got ${a ?? '(absent)'}`);
    }
    return problems;
}
