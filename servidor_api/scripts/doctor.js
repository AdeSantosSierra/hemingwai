#!/usr/bin/env node

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function normalizeOrigin(origin = '') {
    return String(origin).trim().replace(/\/+$/, '');
}

function unique(values) {
    return Array.from(new Set(values));
}

const majorNodeVersion = Number.parseInt(process.versions.node.split('.')[0], 10);
const isNodeVersionSupported = Number.isFinite(majorNodeVersion) && majorNodeVersion >= 18;

const localDevOrigins = process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

const frontendOrigin = process.env.FRONTEND_ORIGIN || '';
const frontendOrigins = (process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = unique(
    [frontendOrigin, ...frontendOrigins, ...localDevOrigins]
        .map(normalizeOrigin)
        .filter(Boolean)
);

let hardFailure = false;

if (!isNodeVersionSupported) {
    console.warn(
        `[doctor] WARN: Node ${process.versions.node} detected. Recommended Node version is >=18.`
    );
} else {
    console.log(`[doctor] OK: Node version ${process.versions.node}`);
}

if (!process.env.CLERK_SECRET_KEY) {
    console.error('[doctor] FAIL: CLERK_SECRET_KEY is required.');
    hardFailure = true;
} else {
    console.log('[doctor] OK: CLERK_SECRET_KEY is set.');
}

if (!frontendOrigin && frontendOrigins.length === 0) {
    console.warn('[doctor] WARN: FRONTEND_ORIGIN/FRONTEND_ORIGINS not set. CORS allowlist should be explicit.');
}

try {
    const resolved = require.resolve('@clerk/express');
    console.log(`[doctor] OK: @clerk/express resolved at ${resolved}`);
} catch (error) {
    console.error('[doctor] FAIL: Cannot resolve @clerk/express. Run `npm install` in servidor_api.');
    hardFailure = true;
}

console.log(
    `[doctor] Effective allowed origins (${allowedOrigins.length}): ${allowedOrigins.join(', ') || '(none configured)'}`
);
console.log('[doctor] Note: requests without Origin (curl/postman) are allowed by CORS policy.');

if (hardFailure) {
    process.exit(1);
}

console.log('[doctor] All hard checks passed.');
