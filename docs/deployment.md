# Deployment

The OSRS Leagues Task Tracker is a purely static React application engineered for simple, zero-infrastructure deployment.

## Build Process
To create a production build locally:
```bash
cd client
npm install
npm run build
```
This process uses **Vite** and **TypeScript** to generate static HTML, CSS, JavaScript, and asset files (e.g., SVG/PNG icons and JSON task files) into the `dist/` directory. 

## Static Hosting Model
Because there's no backend, no cloud database, and all user data is safely kept in the browser's `localStorage`, you can upload the contents of the `dist/` folder directly to any static web host.

Suggested providers:
- **GitHub Pages:** Easy to set up via GitHub Actions.
- **Cloudflare Pages:** Simple connection and global Edge CDN.
- **Netlify / Vercel:** Automated CI/CD by linking your repository.

## Important Note: The Local API Proxy
In `client/vite.config.ts`, you may see an `/api` proxy target.
This block is merely a placeholder for future iterations of the project and is **not used by the tracker in its current release**. The tracker relies solely on statically serving `client/public/data/LEAGUE_X.full.json`.

There is no server-side environment required to run this app.