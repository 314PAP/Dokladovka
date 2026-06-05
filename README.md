<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8e5f69bb-cda3-4fb4-b87d-7a8c457d2e6d

## Run Locally

**Prerequisites:**  Node.js 20+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` and add your API keys:
   ```
   GEMINI_API_KEY=your_gemini_api_key
   VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
   ```
3. Start dev server:
   ```bash
   npm run dev
   ```

## GitHub Pages Deployment

This project deploys to GitHub Pages using GitHub Actions and publishes the built site to the `gh-pages` branch.

**Deployment URL:** https://314pap.github.io/Dokladovka

### Environment Setup

1. No runtime GitHub secret is required for the public SPA.
2. The deployed app should provide a public Google OAuth Client ID through `VITE_GOOGLE_CLIENT_ID` so users can sign in with their own Google accounts immediately.
3. Users can optionally supply their own `Google OAuth Client ID` and `Gemini API key` in the app settings.
4. If you run the server locally, you can still use `.env.local` to store `GEMINI_API_KEY` for the backend server.

### GitHub Pages Settings

1. In GitHub repository settings → Pages, set Source to:
   - Branch: `gh-pages`
   - Folder: `/ (root)`
2. Save the settings.

### Google OAuth Configuration

1. Create OAuth 2.0 Client ID in Google Cloud Console (Web application type).
2. Add authorized JavaScript origins:
   - `http://localhost:5173`
   - `https://314pap.github.io`
3. Add authorized redirect URIs:
   - `http://localhost:5173/`
   - `https://314pap.github.io/Dokladovka/`
4. Add the Client ID as a GitHub repository variable named `VITE_GOOGLE_CLIENT_ID` for GitHub Pages builds.
5. Users can still paste their own Client ID in the app settings if they want to override the app default.

### Build & Deploy Process

- Workflow: `.github/workflows/deploy.yml`
- Trigger: Push to `main` branch
- Build: `npm run build` with `VITE_BASE_URL=/Dokladovka/`
- Publish: `dist/` → `gh-pages` branch
