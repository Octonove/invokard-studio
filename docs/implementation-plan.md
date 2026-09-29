# Invokard Studio Implementation Plan

**Goal:** Deliver and push a working all-in-one Codex media production plugin to a private Octonove repository.
**Architecture:** Bundled local MCP/CLI, file-backed editable projects, FFmpeg renderer, packaged Invokard skills, optional Magnific remote MCP and Higgsfield API adapter.
**Tech Stack:** Node 22+, TypeScript, MCP SDK 1.31, Zod 3, FFmpeg.
**Spec:** design.md

## Global constraints
- Private repository and UNLICENSED beta; no secrets, personal media or generated account data in source.
- Local rendering works without provider accounts; optional generation uses each user's own account.
- No publishing to social platforms and no paid test calls without user-provided credentials and a concrete generation request.
- Bundle runtime so plugin is self-contained; keep dependencies and provider support honest in docs.

## Review focus
- Paths with Unicode, spaces and apostrophes; traversal and symlink escapes.
- Empty, invalid and too-short media; caption and timeline duration mismatch.
- Network failures after paid submission; preserve remote jobs rather than resubmitting.
- Runtime from another cwd, missing FFmpeg or missing credentials.
- Preserve completed exports and source assets when revising or cancelling.

## Tasks
- [x] 1. Root: project schema, file persistence and typed contracts; tests for validation, asset copies and revisions.
- [x] 2. Media worker: FFmpeg rendering, native/voice/music audio mix, timed captions and SRT, covers/carousels, preview; real smoke test plus failure handling.
- [x] 3. Provider worker: Higgsfield request/poll, Magnific music and optional OAuth setup; mocked network tests, no real paid calls.
- [x] 4. Packaging worker: skills, installer, manifests and documentation; validate source/skills and installation paths.
- [x] 5. Root: MCP and CLI integration, persistent render jobs, bundled dependencies and license notices; handshake from a separate directory.
- [x] 6. Review: independent inspection; corrected cross-process edits, worker slots, carousel persistence, caption timing, native audio and Windows command limits.
- [x] 7. Repository created as private: Octonove/invokard-studio. The release upload compares the remote Git tree to the exact locally staged source and bundle; visibility and the final commit are checked separately.

## Authorization and execution
The user approved the integrated design and expressly requested creation and private GitHub delivery. Proceed under that authorization; planning is recorded here without introducing another approval cycle. Independent components are implemented concurrently with explicit file ownership, then integrated and reviewed.
