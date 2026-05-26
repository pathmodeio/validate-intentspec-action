#!/usr/bin/env node

/**
 * IntentSpec CLI
 * Validate intent.md against the IntentSpec schema.
 * https://intentspec.org
 * v1.1.0
 */


import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import Ajv from 'ajv';
// import addFormats from 'ajv-formats';

const program = new Command();

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
