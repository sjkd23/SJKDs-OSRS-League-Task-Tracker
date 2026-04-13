# Deployment

The OSRS Leagues Task Tracker is built natively for **Cloudflare Pages**. While the UI logic itself is a static React application, the "Route Sharing" feature relies on Cloudflare Functions and Cloudflare KV.

## Build Process
To create a production build locally:
```bash
cd client
npm install
npm run build
```
This process uses **Vite** and **TypeScript** to generate static HTML, CSS, JavaScript, and asset files into the `dist/` directory.

## Hosting & Architecture
The project can natively run in one of two ways:

1. **Static / UI-Only Mode:** If you don't need the Route Planner's `/api/share` feature, you can build the `dist/` directory and host it anywhere (e.g., GitHub Pages, Netlify, Vercel). The tracker functionality and local `localStorage` will work flawlessly.
2. **Share-Enabled Mode:** Because of the `/api/share` dependencies inside `client/functions/`, sharing features will break outside of Cloudflare Pages. To fully leverage the route sharing feature, the application must be deployed on **Cloudflare Pages** with its Edge Functions and a **Cloudflare KV** namespace (`ROUTE_SHARES`) attached to the project.

### Cloudflare Pages Deployment (Full Features)
1. Create a Cloudflare Pages project.
2. Link the repository.
3. Set the build command to `npm run build` and directory to `dist`.
4. In the Cloudflare dashboard, go to Settings -> Functions and bind a KV Namespace using the variable name `ROUTE_SHARES`.

This makes the `functions/api/share/` endpoints work flawlessly, while keeping everything else perfectly static edge-cached JSON datasets.