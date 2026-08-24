#!/usr/bin/env node

/**
 * IntentSpec CLI
 * Validate intent.md against the IntentSpec schema.
 * https://intentspec.org
 * v1.2.0
 */


import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import Ajv from 'ajv';
// import addFormats from 'ajv-formats';

const program = new Command();

// Anchors must resolve to sections that exist: outcome:3 in a two-outcome spec is
// a broken reference even though it matches the schema's pattern. The site runs the
// same logic in lib/intentspecAnchors.ts; test/anchors-corpus.json pins the verdicts
// both sides must agree on.
const resolveAnchorErrors = (data: any): string[] => {
    const errors: string[] = [];
    const evidence = Array.isArray(data.evidence) ? data.evidence : [];
    const sectionLengths: Record<string, number> = {
        outcome: Array.isArray(data.outcomes) ? data.outcomes.length : 0,
        edgeCase: Array.isArray(data.edgeCases) ? data.edgeCases.length : 0,
        constraint: Array.isArray(data.constraints) ? data.constraints.length : 0,
        healthMetric: Array.isArray(data.healthMetrics) ? data.healthMetrics.length : 0,
    };
    evidence.forEach((item: any, i: number) => {
        const anchors = Array.isArray(item?.anchors) ? item.anchors : [];
        anchors.forEach((anchor: any) => {
            if (typeof anchor !== 'string') return;
            if (anchor === 'objective' || anchor === 'userGoal') {
                if (!data[anchor]) {
                    errors.push(`/evidence/${i}/anchors "${anchor}" targets a field that is not present in this spec`);
                }
                return;
            }
            const match = anchor.match(/^(outcome|edgeCase|constraint|healthMetric):(\d+)$/);
            if (!match) return; // format itself is enforced by the schema
            const [, section, index] = match;
            if (Number(index) >= sectionLengths[section]) {
                errors.push(`/evidence/${i}/anchors "${anchor}" does not resolve: this spec has ${sectionLengths[section]} ${section} entr${sectionLengths[section] === 1 ? 'y' : 'ies'}`);
            }
        });
    });
    return errors;
};

// Debugging: Log environment state (enabled for troubleshooting)
console.log('[IntentSpec] Env Check:', {
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
    INPUT_FILE: process.env.INPUT_FILE
});

// Detect if running as GitHub Action (using truthiness check)
const isGitHubAction = !!process.env.GITHUB_ACTIONS || !!process.env.INPUT_FILE;

program
    .name('intentspec')
    .description('One-stop tool for Spec-Driven Development')
    .version('0.0.1');

const validateIntent = async (file: string) => {
    const filePath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(filePath)) {
        console.error(chalk.red(`Error: File not found: ${filePath}`));
        process.exit(1);
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const { data } = matter(content);

        // Load Schema
        const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'schema.json'), 'utf-8'));

        // Initialize AJV
        const ajv = new Ajv({
            allErrors: true
        });

        const validate = ajv.compile(schema);
        const valid = validate(data);

        if (valid) {
            const anchorErrors = resolveAnchorErrors(data);
            if (anchorErrors.length > 0) {
                console.error(chalk.red(`❌ Invalid IntentSpec: ${file}`));
                anchorErrors.forEach(err => console.error(chalk.yellow(`- ${err}`)));
                process.exit(1);
            }
            console.log(chalk.green(`✅ ${file} is a valid IntentSpec!`));
            process.exit(0);
        } else {
            console.error(chalk.red(`❌ Invalid IntentSpec: ${file}`));
            validate.errors?.forEach(err => {
                const errorPath = (err as any).instancePath || (err as any).dataPath || 'Root';
                console.error(chalk.yellow(`- ${errorPath} ${err.message}`));
            });
            process.exit(1);
        }
    } catch (error) {
        console.error(chalk.red(`An error occurred: ${(error as Error).message}`));
        process.exit(1);
    }
};

program
    .command('validate')
    .description('Validate an intent.md file against the IntentSpec schema')
    .argument('[file]', 'Path to the intent file', 'intent.md')
    .action(validateIntent);

// Handle GitHub Actions context
// Handle execution
if (isGitHubAction) {
    const file = process.env.INPUT_FILE || 'intent.md';
    console.log(`[IntentSpec] Running in GitHub Actions. Validating: ${file}`);
    validateIntent(file).catch(err => {
        console.error(err);
        process.exit(1);
    });
} else {
    program.parse(process.argv);
}
