# Contributing to the OSRS Leagues Task Tracker

The goal of this repository is to recreate the feel of the OSRS Wiki task list while pushing useful filtering and manual progress tracking tools directly to users. 

This project intends to be lightweight, easy to run, and very faithful to the Wiki visual style. Please refer to `AGENTS.md` for specific developer or LLM workflow expectations.

## Codebase Principles

- **Minimal Backend:** The tool is predominantly static and client-side. Our one exception is Cloudflare Pages Functions (`client/functions/`) used exclusively to save/load shared routes via Cloudflare KV. No complex backend or user management should be introduced.
- **Client-Side First:** All task progress interactions occur against local state. 
- **Wiki-first UI:** Ensure filters or UI additions remain clean and readable, not flashy or overly modernized past the OSRS thematic style.
- **Clear Types:** Always provide explicit model typing where reasonable (e.g., `ScraperTask`, `AppTask`, `TaskUserState`) before mapping data into components.

## Local Workflow

For a standard frontend dev loop, the app can be run in two modes:

**1. UI-Only / Static Mode (Quickest)**
Use this pattern if you only need to work on the UI, component logic, or basic data filtering. Route sharing functions (`/api/share`) will be disabled or return `404 Not Found`.
1. Clone and run `npm install` inside the `client` directory.
2. Run `npm run dev` to start Vite.

**2. Share-Enabled Mode (Cloudflare Pages + KV)**
Use this pattern if you are modifying Route Planner features, testing the `/api/share` endpoint logic natively, or interacting with `ROUTE_SHARES` mock KV objects local storage.
1. Run `npm run pages:dev`. This command uses Wrangler to proxy Vite, while also spawning local mock CF functions + Key Value stores seamlessly mapping `client/functions/api/share`.

**General Workflow:**
1. Validate modifications on both desktop (**TaskTable**) and mobile views (**MobileTaskList**).
2. Ensure `npm run lint` passes before pushing changes.

When making a stylistic or component refactor:
1. Don't mix data mapping logic with UI logic when possible - instead, update mapping functions inside `src/lib/`.
2. Don't add large new third-party dependencies without a clear reason. Tailwind CSS, React, and Vite form the core app foundation.