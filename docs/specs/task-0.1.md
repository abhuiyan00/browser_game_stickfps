# Spec — Task 0.1: Write PROJECT.md / SRS

## Scope

Produce the product brief (PROJECT.md) and formal SRS (docs/SRS.md) capturing: 5v5 tactical stickman FPS, Revolver + Kar98 weapons, Geckos.io networking, Supabase anon auth + 6-char room codes, Vercel frontend / Fly.io backend, zero PII. Does not include any code, config, or dependency installation — that begins at Phase 1.

## Files

- `PROJECT.md` — concise product brief, pillars table, repo layout, non-goals.
- `docs/SRS.md` — formal SRS: scope, constraints, functional/non-functional requirements per phase, architecture/sequence/state diagrams (Mermaid), data schemas, traceability table.

## Interfaces

None — this is a documentation-only task. Message/data shapes sketched in SRS §6 are provisional pending Phase 4/5/6 architect specs, which own the exact TypeScript interfaces.

## Constraints carried over

All five architecture constraints (server authority, no P2P mesh, fixed timestep, object pooling, Vercel/Fly.io split) are captured in PROJECT.md's pillars table and SRS §2.4 so every later spec can cite them by ID (C1–C6).

## Acceptance criteria

1. PROJECT.md exists at repo root and names all five required elements (game type, weapons, networking library, auth mechanism, hosting split).
2. docs/SRS.md exists, contains at least one diagram per: architecture, sequence (x2), state (x2), component.
3. Every phase in TASKS.md has a corresponding functional-requirement block in SRS §3.
4. No application code, package.json, or dependency was added in this task.

## Open questions

None.
