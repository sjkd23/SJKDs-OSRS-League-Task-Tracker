# OSRS Leagues Task Tracker

A custom task tracker for the upcoming Old School RuneScape Leagues, focused on **Demonic Pacts**.

The goal is to recreate the feel of the official OSRS Wiki task list as closely as possible, including a familiar layout and both light/dark mode styling, while adding extra quality-of-life features that make planning and progression easier.

This project is mainly for fun and personal use. The intention is to build something that feels very close to the wiki experience, but with additional tools for sorting, planning, and tracking tasks more conveniently.

## Tech Stack

- **TypeScript**
- **Tailwind CSS**

## Core Goal

Build a Leagues task tracker that:

- Feels visually similar to the OSRS Wiki task list
- Supports both light mode and dark mode
- Adds useful planning and filtering tools on top of the standard task list
- Potentially supports automatic task syncing from external sources

## Planned Features

### 1. Wiki-like task list UI
The tracker should stay as close as possible to the OSRS Wiki task list in terms of structure, readability, and overall feel.

Possible goals here:

- Similar table/list layout
- Similar spacing and information density
- Light and dark theme support inspired by the wiki
- Familiar task presentation so it feels immediately usable

### 2. Task sorting and filtering
Tasks should be easy to browse and narrow down based on what the player wants to focus on.

Planned sorting/filtering options:

- By **skill**
- By **region**
- By **task difficulty** (Easy, Medium, Hard, Elite, Master, etc.)
- By combinations of those filters
- Potentially additional filters later, depending on what is useful during Leagues

Examples:

- Show all Fishing tasks in Kandarin
- Show all Hard tasks in unlocked regions
- Show all tasks for a specific skill and difficulty combination

### 3. To-do / favourites list
A personal planning system for saving tasks you want to come back to.

Intended functionality:

- Mark tasks as **to-do** or **favourite**
- View saved tasks in a separate list or panel
- Use it as a progression route, such as:
  - “Do this task”
  - “Then do this one”
  - “Then do this one next”
- Remove tasks manually when no longer needed
- Potentially remove tasks automatically when completed, depending on how task sync works

This feature should help with remembering short-term and long-term goals during Leagues.

### 4. Relic tracking
Potential future feature for tracking Leagues build choices.

Ideas:

- Selected relics
- Chosen regions
- Build overview / summary
- Possibly show tasks that pair well with your choices

This may be useful as a separate panel or account summary area.

### 5. Better wiki linking / navigation
Tasks should be easier to use as a jumping-off point for learning or planning.

Example:
- A task like `Catch a trout` should let the user click **trout** and go directly to the relevant wiki page

Ideas:

- Link task names or keywords to wiki pages
- Link skill names to wiki skill pages
- Link items, monsters, activities, or regions when relevant
- Improve convenience without cluttering the UI too much

## Design Philosophy

This project should feel like:

- The OSRS Wiki task list, but more interactive
- Familiar and easy to scan
- Useful for actual planning during Leagues
- Clean, fast, and practical

The main priority is preserving the wiki-like experience while adding features that genuinely improve usability.

## Open Questions / Things to Research

- How close should the UI go to the wiki styling?
- Should to-do items be ordered manually, automatically, or both?
- How should relic and region selections be represented in the UI?
- What task metadata will be needed to support filtering cleanly?

## Initial Scope

A good first version would likely include:

- A wiki-inspired task list layout
- Light/dark mode
- Sorting and filtering by skill / region / difficulty
- Manual task completion tracking
- Manual to-do / favourites list

After that, the next major upgrade would be:

- Automatic syncing
- Relic / region build tracking
- Better wiki navigation links