#!/usr/bin/env node

/**
 * Test Script: Full Compact → Enriched Pipeline
 *
 * Tests the production code:
 * 1. itinerary-service-compact.ts - generates token-efficient itinerary
 * 2. itinerary-enrichment-pipeline.ts - enriches with places, restaurants, routing
 *
 * Usage: node --experimental-specifier-resolution=node --loader ts-node/esm scripts/test-full-pipeline.mjs
 * Or use the API route: GET /api/test/full-pipeline
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const outputDir = join(projectRoot, 'output');

// Load .env.local
function loadEnv() {
    const envPath = join(projectRoot, '.env.local');
    if (existsSync(envPath)) {
        const content = readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    let value = trimmed.slice(eqIdx + 1).trim();
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            }
        }
    }
}

loadEnv();

console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║     FULL PIPELINE TEST                                               ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');
console.log('\n⚠️  This script requires ts-node to import TypeScript modules.');
console.log('   Use the API route instead:\n');
console.log('   curl http://localhost:3000/api/test/full-pipeline\n');
console.log('   Or run: npm run dev  # then visit the URL above\n');
