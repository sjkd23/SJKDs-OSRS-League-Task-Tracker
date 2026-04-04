# Contributing to the OSRS Leagues Task Tracker

The goal of this repository is to recreate the feel of the OSRS Wiki task list while pushing useful filtering and manual progress tracking tools directly to users. 

This project intends to be lightweight, easy to run, and very faithful to the Wiki visual style. Please refer to `AGENTS.md` for specific developer or LLM workflow expectations.

## Codebase Principles

- **No Overengineering:** The tool presently is static and client-side. Keep it simple. No complex state architectures or backend sync mechanisms should be introduced without substantial justification.
- **Client-Side First:** All task interactions occur against local state. 
- **Wiki-first UI:** Ensure filters or UI additions remain clean and readable, not flashy or overly modernized past the OSRS thematic style.
- **Clear Types:** Always provide explicit model typing where reasonable (e.g., `ScraperTask`, `AppTask`, `TaskUserState`) before mapping data into components.

## Local Workflow

For a standard frontend dev loop:

1. Clone and run `npm install` inside the `client` directory.
2. Run `npm run dev` to start Vite.
3. Validate modifications on both desktop (**TaskTable**) and mobile views (**MobileTaskList**).
4. Ensure `npm run lint` passes before pushing changes.

## Refactors

When making a stylistic or component refactor:
1. Don't mix data mapping logic with UI logic when possible—instead, update mapping functions inside `src/lib/`.
2. Don't add large new third-party dependencies without a clear reason. Tailwind CSS, React, and Vite form the core app foundation.