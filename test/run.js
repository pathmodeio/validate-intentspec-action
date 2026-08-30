#!/usr/bin/env node

/**
 * Test suite for validate-intentspec-action.
 *
 * 1. Fixture verdicts: runs dist/index.js against the fixtures in test/fixtures
 *    and asserts exit codes and key error messages.
 * 2. Anchor corpus: runs every case in test/anchors-corpus.json through the CLI
 *    and asserts the exact messages. The same file is pinned on the site side by
 *    lib/intentspecAnchorsCorpus.test.ts, so the browser validator and this
 *    action cannot drift apart on anchor resolution without a test going red.
 * 3. Build freshness: src/schema.json must equal dist/schema.json.
 * 4. Drift + normalization corpus (skipped when SKIP_DRIFT=1): src/schema.json and
 *    test/anchors-corpus.json must equal the copies published at intentspec.org, and the
 *    normalization corpus is FETCHED from there rather than vendored, so a stale local copy
 *    cannot pass forever. Old text follows: src/schema.json and test/anchors-corpus.json
 *    must equal the copies published at intentspec.org, which is the source of
 *    truth. CI runs this on a schedule, not on every PR, so a site outage cannot
 *    fail unrelated pull requests.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const matter = require('gray-matter');

const root = path.join(__dirname, '..');
let failures = 0;

const fail = (msg) => {
    console.error(`✗ ${msg}`);
    failures++;
};
const pass = (msg) => console.log(`✓ ${msg}`);

// dist/index.js picks Action mode over CLI mode by sniffing the environment, and
// on a GitHub runner GITHUB_ACTIONS is always set. Left in place it would ignore
// the fixture path entirely and validate ./intent.md, so every case here would
// fail on CI for a reason that has nothing to do with the code under test.
const CLI_ENV = (() => {
    const env = { ...process.env };
    delete env.GITHUB_ACTIONS;
    delete env.INPUT_FILE;
    return env;
})();

const runValidator = (file) => {
    try {
        const stdout = execFileSync('node', [path.join(root, 'dist', 'index.js'), 'validate', file], {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: CLI_ENV,
        });
        return { code: 0, output: stdout };
    } catch (e) {
        return { code: e.status, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
};

// --- 1. Fixture verdicts ----------------------------------------------------

const CASES = [
    { fixture: 'valid-v10.md', code: 0 },
    { fixture: 'valid-v12.md', code: 0 },
    // SPEC.md section 1 defines two markdown serializations, and section 2 the normalization.
    // valid-sectioned.md is the standards repo's conformance fixture built from the REAL
    // pathmode-intent OpenSpec template: lists in ## sections, id/status in frontmatter. Until
    // v1.2.0 this Action read frontmatter only and rejected it for "missing" fields it visibly
    // contained. These three fixtures are vendored from pathmodeio/intentspec conformance/, which
    // is what holds this Action and the reference normalizer in behavioral parity.
    { fixture: 'valid-sectioned.md', code: 0 },
    { fixture: 'invalid-sectioned-no-frontmatter.md', code: 1, contains: "required property 'id'" },
    { fixture: 'invalid-broken-frontmatter.md', code: 1, contains: 'frontmatter is not valid YAML' },
    { fixture: 'invalid-missing-required.md', code: 1, contains: "required property 'outcomes'" },
    { fixture: 'invalid-empty-outcomes.md', code: 1, contains: 'fewer than 1 items' },
    { fixture: 'invalid-anchor-out-of-range.md', code: 1, contains: '"outcome:3" does not resolve' },
    { fixture: 'invalid-anchor-missing-usergoal.md', code: 1, contains: '"userGoal" targets a field that is not present' },
];

for (const { fixture, code, contains } of CASES) {
    const result = runValidator(path.join(__dirname, 'fixtures', fixture));
    if (result.code !== code) {
        fail(`${fixture}: expected exit ${code}, got ${result.code}\n${result.output}`);
        continue;
    }
    if (contains && !result.output.includes(contains)) {
        fail(`${fixture}: output missing "${contains}"\n${result.output}`);
        continue;
    }
    pass(`${fixture} → exit ${code}`);
}

// --- 1b. Normalization corpus (fetched, never vendored) ----------------------
// Runs at the bottom with the other network checks; see runNormalizationCorpus().

// --- 2. Anchor corpus -------------------------------------------------------

const corpusPath = path.join(__dirname, 'anchors-corpus.json');
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf-8'));

if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) {
    fail('anchors-corpus.json has no cases');
} else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'intentspec-corpus-'));
    for (const [i, testCase] of corpus.cases.entries()) {
        const file = path.join(tmp, `case-${i}.md`);
        fs.writeFileSync(file, matter.stringify('', testCase.spec));
        const expected = testCase.expectedErrors ?? [];
        const result = runValidator(file);
        const wantCode = expected.length === 0 ? 0 : 1;
        if (result.code !== wantCode) {
            fail(`corpus "${testCase.name}": expected exit ${wantCode}, got ${result.code}\n${result.output}`);
            continue;
        }
        const missing = expected.filter((err) => !result.output.includes(err));
        if (missing.length > 0) {
            fail(`corpus "${testCase.name}": output missing ${missing.map((m) => `"${m}"`).join(', ')}\n${result.output}`);
            continue;
        }
        pass(`corpus: ${testCase.name}`);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
}

// --- 3. Build freshness -----------------------------------------------------

const srcSchema = JSON.parse(fs.readFileSync(path.join(root, 'src', 'schema.json'), 'utf-8'));
const distSchema = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'schema.json'), 'utf-8'));
if (JSON.stringify(srcSchema) !== JSON.stringify(distSchema)) {
    fail('dist/schema.json differs from src/schema.json — run npm run build');
} else {
    pass('dist/schema.json matches src/schema.json');
}

// --- 4. Drift against the published source of truth -------------------------

const finish = () => {
    if (failures > 0) {
        console.error(`\n${failures} check(s) failed`);
        process.exit(1);
    }
    console.log('\nAll checks passed');
};

const fetchJson = (url) =>
    new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error(`${url} returned HTTP ${res.statusCode}`));
                    return;
                }
                let body = '';
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(new Error(`could not parse ${url}: ${e.message}`));
                    }
                });
            })
            .on('error', (e) => reject(new Error(`could not fetch ${url}: ${e.message}`)));
    });

const DRIFT_CHECKS = [
    {
        url: 'https://intentspec.org/schema.json',
        local: srcSchema,
        label: 'src/schema.json',
    },
    {
        url: 'https://intentspec.org/anchors-corpus.json',
        local: corpus,
        label: 'test/anchors-corpus.json',
    },
];

/**
 * The normalization corpus is FETCHED, not vendored.
 *
 * A copy in this repo would pass forever against whatever it was copied at, which is the exact
 * staleness the corpus exists to prevent: it is the artifact holding four implementations of
 * SPEC.md section 2 to one reading of a document, so a stale copy is worse than none. The
 * comparison logic (corpus-compare.mjs) stays vendored and reviewed; only the DATA is fetched.
 *
 * A fetch failure is reported and skips these cases rather than passing silently, on the same
 * reasoning as the drift check: a site outage must not look like conformance.
 */
const runNormalizationCorpus = () =>
    fetchJson('https://intentspec.org/normalization-corpus.json')
        .then((corpus) => {
            const { project, diff } = require('./corpus-compare.mjs');
            const { normalizeMarkdown } = require('../dist/normalize-for-test.js');
            const yaml = require('js-yaml');
            for (const c of corpus.cases) {
                const result = normalizeMarkdown(c.markdown, (y) => yaml.load(y));
                if (!result.ok) { fail(`normalization: ${c.name} — did not parse: ${result.error}`); continue; }
                const problems = diff(c.normalized, project(result.doc, corpus.comparedFields));
                if (problems.length) fail(`normalization: ${c.name}\n    ${problems.join('\n    ')}`);
                else pass(`normalization: ${c.name}`);
            }
        })
        .catch((e) => fail(`normalization corpus: ${e.message}`));

if (process.env.SKIP_DRIFT === '1') {
    console.log('- drift check and normalization corpus skipped (SKIP_DRIFT=1)');
    finish();
} else {
    Promise.all(
        DRIFT_CHECKS.map(({ url, local, label }) =>
            fetchJson(url)
                .then((published) => {
                    if (JSON.stringify(published) !== JSON.stringify(local)) {
                        fail(`${label} has drifted from ${url} — sync from the site and re-release`);
                    } else {
                        pass(`${label} matches the published copy`);
                    }
                })
                .catch((e) => fail(e.message))
        )
    )
        .then(runNormalizationCorpus)
        .then(finish);
}
