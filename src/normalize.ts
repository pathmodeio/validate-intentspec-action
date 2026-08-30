/**
 * Markdown IntentSpec -> the model, per SPEC.md section 2.
 *
 * VENDORED from the reference implementation at
 * https://github.com/pathmodeio/intentspec/blob/main/conformance/normalize.mjs (a TypeScript port,
 * same structure and comments). The standards repo is the source of truth for this logic; edit it
 * there first. Behavioral parity is held by running its conformance fixtures in test/run.js, which
 * is the guarantee that matters: this Action must accept and reject exactly what the corpus says.
 *
 * Why this exists here: until v1.2.0 this Action read only the YAML frontmatter (gray-matter) and
 * validated that object, so a conforming *sectioned* intent.md, the serialization real authoring
 * templates produce, was rejected with "missing required fields" it visibly contained. The spec
 * (section 1) is explicit that a validator reading only frontmatter is the defective party.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?([\s\S]*)$/;

/** Fences first, then comments: a `<!--` inside a fence must not open a comment that eats prose. */
function stripNonContent(body: string): string {
    const out: string[] = [];
    let fence: { char: string; len: number } | null = null;
    for (const line of body.split('\n')) {
        const marker = line.match(/^\s*(`{3,}|~{3,})/);
        if (marker) {
            const char = marker[1][0];
            const len = marker[1].length;
            if (!fence) fence = { char, len };
            else if (char === fence.char && len >= fence.len) fence = null;
            continue;
        }
        if (!fence) out.push(line);
    }
    const withoutFences = out.join('\n');
    const withoutComments = withoutFences.replace(/<!--[\s\S]*?-->/g, '');
    const dangling = withoutComments.indexOf('<!--');
    return dangling === -1 ? withoutComments : withoutComments.slice(0, dangling);
}

function splitSections(body: string): Map<string, string[]> {
    const sections = new Map<string, string[]>();
    let current: string[] | null = null;
    for (const line of body.split('\n')) {
        const heading = line.match(/^##\s+(.+?)\s*$/);
        if (heading) { current = []; sections.set(heading[1], current); continue; }
        if (/^#\s+/.test(line)) { current = null; continue; }
        if (current) current.push(line);
    }
    return sections;
}

const isListItem = (l: string) => /^\s*[-*]\s/.test(l);
const stripMarker = (l: string) => l.replace(/^\s*[-*]\s+(\[.\]\s+)?/, '').trim();

function listOf(sections: Map<string, string[]>, heading: string): string[] {
    return (sections.get(heading) ?? []).filter(isListItem).map(stripMarker).filter(Boolean);
}

function edgeCasesOf(sections: Map<string, string[]>): { scenario: string; expectedBehavior: string }[] {
    const out: { scenario: string; expectedBehavior: string }[] = [];
    for (const raw of listOf(sections, 'Edge Cases')) {
        const bold = raw.match(/^\*\*(.+?)\*\*:\s*(.+)$/);
        if (bold) { out.push({ scenario: bold[1].trim(), expectedBehavior: bold[2].trim() }); continue; }
        const arrow = raw.match(/^(.+?)\s*(?:->|→)\s*(.+)$/);
        if (arrow) out.push({ scenario: arrow[1].trim(), expectedBehavior: arrow[2].trim() });
        // An item with no expected behavior is not an edge case; it is dropped (SPEC.md 2).
    }
    return out;
}

/** Verification flattens to an array of strings: labels are readability, not model (SPEC.md 2). */
function verificationOf(sections: Map<string, string[]>): string[] {
    const lines = sections.get('Verification') ?? [];
    return lines.filter(isListItem).map(stripMarker).filter(Boolean);
}

export type NormalizeResult =
    | { ok: true; doc: Record<string, unknown> }
    | { ok: false; error: string };

/** Parse a markdown IntentSpec into the model. `parseYaml` is injected (js-yaml's load). */
export function normalizeMarkdown(text: string, parseYaml: (s: string) => unknown): NormalizeResult {
    let frontmatter: Record<string, unknown> = {};
    let body = text;

    if (/^---\r?\n/.test(text)) {
        const match = text.match(FRONTMATTER_RE);
        // Malformed frontmatter fails the whole document; never fall back to the body (SPEC.md 2).
        if (!match) return { ok: false, error: 'frontmatter is not closed by a --- delimiter' };
        try {
            const parsed = parseYaml(match[1]);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                frontmatter = parsed as Record<string, unknown>;
            }
        } catch (e) {
            return { ok: false, error: `frontmatter is not valid YAML: ${(e as Error).message}` };
        }
        body = match[2] ?? '';
    }

    const clean = stripNonContent(body);
    const sections = splitSections(clean);
    const doc: Record<string, unknown> = { ...frontmatter };

    const h1 = clean.match(/^#\s+(.+)$/m);
    const title = frontmatter.title ?? frontmatter.userGoal ?? (h1 ? h1[1].trim() : undefined);
    if (title) doc.title = title;

    // Scalars: frontmatter wins. Lists: a non-empty section wins.
    const sectionObjective = (sections.get('Objective') ?? []).join('\n').trim();
    if (!doc.objective && sectionObjective) doc.objective = sectionObjective;

    for (const [field, heading] of [
        ['outcomes', 'Outcomes'],
        ['constraints', 'Constraints'],
        ['healthMetrics', 'Health Metrics'],
    ] as const) {
        const fromSection = listOf(sections, heading);
        if (fromSection.length) doc[field] = fromSection;
    }

    const edgeCases = edgeCasesOf(sections);
    if (edgeCases.length) doc.edgeCases = edgeCases;

    const verification = verificationOf(sections);
    if (verification.length) doc.verification = verification;

    return { ok: true, doc };
}
