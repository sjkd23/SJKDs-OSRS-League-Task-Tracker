# AGENTS.md

## Project Overview
This repository is an **OSRS Leagues task tracker** for the **Raging Echoes** League.

The goal is to recreate the feel of the **OSRS Wiki task list** as closely as practical, while adding quality-of-life features such as:

- filtering and sorting by skill, region, and difficulty
- manual and possibly automatic completion tracking
- a to-do / favourites system
- optional relic / region planning helpers
- strong wiki integration and convenient outbound links

This project should feel **wiki-first**, not like a generic dashboard app.

## Primary Tech Stack
- **TypeScript**
- **Tailwind CSS**

Assume a modern TypeScript web app structure unless the repo clearly defines otherwise.

## Product Priorities
When making decisions, optimize for these in order:

1. **Preserve the OSRS Wiki-like experience**
2. **Keep the UI fast, clean, and easy to scan**
3. **Make filtering / planning features genuinely useful**
4. **Avoid overengineering early**
5. **Prefer maintainable, incremental additions**

## Development Principles
- Keep changes **small, focused, and reversible**
- Follow existing patterns before introducing new abstractions
- Prefer **clarity over cleverness**
- Do not add dependencies without a clear reason
- Avoid premature generalization for features that are still speculative
- Preserve a clean separation between:
  - task data
  - filtering/sorting logic
  - persistence/state
  - presentation/UI

## UI / Design Rules
- The visual direction should remain **very close to the OSRS Wiki task list**
- Light mode and dark mode should both be supported
- Styling should prioritize:
  - dense but readable information display
  - predictable spacing
  - low visual noise
  - familiar wiki-like structure
- Do not introduce flashy UI libraries or overly modernized redesigns unless explicitly requested
- New features should feel like natural extensions of the wiki layout

## Data / Domain Expectations
Treat task data as a core domain model. Task records will likely need fields such as:

- id
- name
- description
- difficulty
- skill
- region(s)
- league point value
- wiki link data
- completion state
- todo/favourite state

Design for future metadata expansion without making the first version overly abstract.

## Feature Expectations
### Current likely MVP
- task list rendering
- light/dark mode
- filtering by skill, region, difficulty
- combinations of filters
- manual completion tracking
- manual to-do / favourites list

### Likely later features
- automatic sync from wiki / RuneLite-related sources
- relic tracking
- region unlock tracking
- richer wiki deep-linking

Build current features so later sync support can be added without a rewrite.

## Persistence Guidance
Assume user-specific state may eventually include:
- completed tasks
- selected regions
- selected relics
- todo/favourite items
- UI preferences

Prefer simple persistence first. Do not build backend complexity unless the repo requirements justify it.

## Code Style
- Use strict, readable TypeScript
- Prefer explicit types on important domain models
- Keep components and functions single-purpose
- Extract reusable utilities only after repetition is clear
- Avoid large files that mix data logic and UI logic
- Name things clearly according to OSRS / task-tracker domain language

## Agent Behavior
When working in this repository:

- Respect the project’s wiki-like design goal
- Do not perform unrelated refactors
- Do not replace simple solutions with framework-heavy patterns
- Keep commits/changes scoped to the requested task
- Preserve existing naming and structure where reasonable
- If introducing a new pattern, make sure it clearly improves maintainability for this project

## When Unsure
Default to:
- simpler architecture
- minimal dependencies
- wiki-like UI fidelity
- incremental feature delivery
- clean TypeScript models for future expansion