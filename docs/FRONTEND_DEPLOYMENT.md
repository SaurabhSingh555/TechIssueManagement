# Frontend Deployment — Vercel

The frontend is a standard Vite + React + JavaScript app (repo root).

## 1. Configure environment variables

In Vercel → Project → Settings → Environment Variables, add:

| Variable                  | Value                                                    |
| ------------------------- | -------------------------------------------------------- |
| `VITE_SUPABASE_URL`       | `https://<project-ref>.supabase.co`                      |
| `VITE_SUPABASE_ANON_KEY`  | Supabase **anon** key (public key — safe in the browser) |
| `VITE_API_URL`            | your deployed backend URL, e.g. `https://tims-api.onrender.com` |

> **NEVER add `SUPABASE_SERVICE_ROLE_KEY` to Vercel.** The service-role key is
> backend-only.

## 2. Deploy

1. Push this repo to GitHub/GitLab.
2. Vercel → New Project → import the repo.
3. Framework preset: **Vite** (auto-detected). Root directory: repository root.
4. Build command: `npm run build`. Output directory: `dist`.
5. Deploy. The included `vercel.json` rewrites all routes to `index.html`
   (SPA routing).

## 3. Post-deploy checks

- Open the Vercel URL → login page loads.
- Sign in with a seeded account → dashboard renders with live data from FastAPI.
- Add the Vercel URL to your backend `CORS_ORIGINS` and to Supabase Auth
  "Site URL"/"Redirect URLs".

## 4. Local build

```bash
npm install
npm run build      # outputs dist/
npm run preview    # serve the production build locally
```
