# Oluwafemi David Adekanola — Full-Stack Developer Portfolio

A playful, notebook-paper and sticker-style personal portfolio and client showcase website for **Oluwafemi David Adekanola**, Full-Stack Website Developer based in Ilorin, Kwara State, Nigeria.

---

## ⚡ Live URLs
- **Current Live Cloud Preview:** [Open Live Applet](https://ais-pre-lpgbgwoa45oj26m3lnxjrs-688432237796.europe-west2.run.app)
- **Direct WhatsApp Chat:** [+234 911 574 2760](https://wa.me/2349115742760)
- **Direct Phone Call:** `0805 476 3626`
- **Cloudinary CDN Profile Photo:** `https://res.cloudinary.com/luf95toj/image/upload/v1792675401/IMG-20261022-WA2850.jpg`
- **Supabase Project Endpoint:** `https://plnfmgqjaspzucomxbsy.supabase.co`

---

## 🚀 How to Publish This Project (Step-by-Step)

You can publish this portfolio to any hosting provider in under 2 minutes:

### Option 1: Publish to Netlify (Drag & Drop — Fastest, No Command Line Needed)
1. Run `npm run build` to generate the production-ready `dist` folder.
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
3. Drag and drop the `dist` folder directly onto the browser window.
4. Netlify will deploy your site instantly with a free `.netlify.app` domain and free SSL!
5. (Optional) Connect your custom domain (e.g., `davidfemi.dev`) under **Domain management**.

### Option 2: Publish to Vercel
1. Install the Vercel CLI (or push to GitHub and connect to [vercel.com](https://vercel.com)):
   ```bash
   npm i -g vercel
   vercel
   ```
2. For production deployment:
   ```bash
   vercel --prod
   ```
3. A `vercel.json` file is already included in this repository with optimal headers and routing.

### Option 3: Publish to GitHub Pages
1. Push this repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial portfolio commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. In your GitHub repository:
   - Go to **Settings** → **Pages**.
   - Under **Build and deployment**, select **GitHub Actions** (or deploy from branch `gh-pages` / `dist` folder).

### Option 4: Traditional Web Hosting (cPanel / Apache / Nginx / Namecheap)
- Upload all files from the `dist/` directory (or simply `index.html` and `profile.jpg`) to your `public_html` directory via FTP or File Manager.

---

## ☁️ Cloud Storage & Database Architecture

### 1. Contact Form Persistence (Supabase Database)
- **Endpoint:** `https://plnfmgqjaspzucomxbsy.supabase.co`
- **Table Name:** `messages`
- Every visitor submission from the `#contact` form is saved directly to your Supabase `messages` table before routing them smoothly into WhatsApp chat (`+2349115742760`).
- Columns in Supabase `messages` table:
  - `name` (text)
  - `email` (text)
  - `phone` (text, nullable)
  - `project_type` (text)
  - `budget` (text)
  - `message` (text)
  - `created_at` (timestamp with time zone)
- **Supabase Publishable Key:** Can be set in your `.env` as `VITE_SUPABASE_ANON_KEY` or saved interactively via the built-in **"Showcase & Storage Space"** modal on the website (under the *Backup & Cloud Sync* tab).

### 2. Website Samples & Client Reviews Storage Space
- Built-in interactive management modal allowing you to add, edit, or delete website samples and client testimonials.
- Uses persistent client-side storage with one-click **JSON Export / Backup** and **JSON Import** so you can preserve your live portfolio items across any device or migration.

### 3. Media & Assets (Cloudinary CDN)
- Profile photo is hosted and delivered on Cloudinary's global edge network:
  `https://res.cloudinary.com/luf95toj/image/upload/v1792675401/IMG-20261022-WA2850.jpg`

---

## 🛠️ Local Development & Build Commands

```bash
# 1. Install dependencies
npm install

# 2. Run local development server (port 3000)
npm run dev

# 3. Compile & type-check
npm run lint

# 4. Build for production (outputs to /dist)
npm run build

# 5. Preview the production build locally
npm run preview
```

---

## 📋 Features Included
- **Sticker & Notebook-Paper Aesthetic:** Hand-drawn borders, washi tape effects, animated floating background lines, polaroid photo cards, and retro pixel typography.
- **Dynamic Showcase & Review Storage:** Easily upload new projects and client testimonials directly from the UI.
- **Direct Client Channels:** One-tap WhatsApp chat (`+2349115742760`) and direct phone call (`0805 476 3626`).
- **Interactive Service Pre-fill:** Clicking "Get a quote" on any service pre-populates the project type and inquiry message.
- **Responsive & Mobile-First:** Fluid layout optimized for smartphones, tablets, laptops, and ultra-wide displays.
