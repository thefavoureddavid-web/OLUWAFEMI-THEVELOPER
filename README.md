# Oluwafemi David Adekanola — Full-Stack Developer Portfolio

Live: https://oluwafemi-thedeveloper.vercel.app
Stack: React + Vite + Tailwind + Supabase + Vercel

### What I Built
Production portfolio with lead capture and protected admin dashboard (/admin).

- Contact form with validation, toasts, and rate limiting
- Admin dashboard to view/delete/mark-as-read messages
- Protected routes with Supabase Auth
- Deployed on Vercel with env handling

### Hardest Bugs I Fixed
1. **Supabase RLS blocked anon inserts** — Fixed by creating separate policies: INSERT for anon, SELECT for authenticated only.
2. **Vercel env vars not loading** — Learned VITE_ prefix requirement and redeploy flow.
3. **Admin route exposed** — Fixed with auth guard and redirect to login.

### What I Learned
- Row Level Security mental model
- Protected routes pattern
- Production UX (no alerts, loading skeletons)

### Run Locally
npm install
npm run dev
