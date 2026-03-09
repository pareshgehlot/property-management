# Property Management (minimal)

This project contains a small Node/Express backend that downloads .ics booking files in the background and a lightweight static frontend (HTML/JS) that shows properties and a dashboard with bookings visualized.

Structure
- `server/` - Express API, stores `properties.json` and caches parsed bookings in `server/cache/*.json`.
- `client/` - static frontend (served by server during development) in `client/`.

Quick start (backend)

1. Install dependencies:

```bash
cd server
npm install
```

2. Start the server:

```bash
npm start
```

The server listens on port 3000 by default.

Environment configuration
- Copy `server/.env.example` to `server/.env` and set `ADMIN_USER` and `ADMIN_PASS` if you want to change the default credentials. The server picks values from `.env`.

Open `http://localhost:3000/client/index.html` (or `http://localhost:3000/` if you copy files into server static folder) to use the UI.

Notes about hosting
- GitHub Pages can host the static `client/` site, but the backend must be hosted elsewhere (Render, Vercel, Heroku, etc.).
- To deploy frontend to GitHub Pages, build a static copy of `client/` and push to a gh-pages branch or use GitHub Pages settings.

Angular frontend (`client-angular`)
- I scaffolded a full Angular CLI project in `client-angular/` and migrated the UI into `AppComponent` with an `ApiService` to call the backend.
- To build the Angular app locally:

```bash
cd client-angular
npm install
npm run build
```

- The compiled files will be under `client-angular/dist/client-angular/`. You can copy those files to any static host or push them to GitHub Pages.
Server can serve Angular build
- If you keep the Angular build in `client-angular/dist/client-angular/`, the Express server will automatically serve it at `/` (the server will serve the built files if present). That means a single `node server/index.js` can serve both API and frontend.

Deploy to GitHub Pages (simple manual way):
1. Build the app (see commands above).
2. Copy the contents of `client-angular/dist/client-angular/` into a branch `gh-pages` (or use GitHub Pages settings to serve from `gh-pages` branch or `docs/` folder on `main`).

Example quick deploy (local, manual):

```bash
cd client-angular/dist/client-angular
git init
git add .
git commit -m "deploy frontend"
git branch -M gh-pages
git remote add origin <your-repo-url>
git push -f origin gh-pages
```

If you'd like, I can add an automated deploy script using `angular-cli-ghpages`.

ICS / bookings
- When you add a property (name + ics URL) the server will immediately start downloading the .ics file in the background and cache parsed events under `server/cache/<id>.json`.
- The dashboard fetches cached events for date ranges using `/api/properties/:id/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD`.

Limitations & next steps
- This is a minimal implementation without user accounts or authentication.
- The backend currently triggers a new background fetch when adding the same property; a better refresh endpoint could be added.
- If you want an Angular frontend for direct GitHub Pages deployment, I can scaffold it next.
