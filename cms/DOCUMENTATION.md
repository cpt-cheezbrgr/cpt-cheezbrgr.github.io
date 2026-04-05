# Magic Pixel Monkey Blog CMS — Documentation

## Overview

A lightweight, self-hosted blog CMS built on Node.js and deployed to Google Cloud Run. Two interfaces:

- **Public blog** — server-rendered at `magicpixelmonkey.com`
- **Admin dashboard** — protected at `magicpixelmonkey.com/admin`

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (Alpine Linux container) |
| Web framework | Express.js |
| Templating (public blog) | EJS |
| Database | Google Cloud Firestore |
| File storage | Google Cloud Storage (`blog-cms-media` bucket) |
| Authentication | JWT tokens in httpOnly cookies, bcrypt (12 rounds) |
| Editor | Quill.js (WYSIWYG, stores HTML) |
| Legacy rendering | marked.js (auto-detects old Markdown posts) |
| Security headers | helmet |
| Rate limiting | express-rate-limit |
| Email (password reset) | Nodemailer via SMTP |
| Hosting | Google Cloud Run (`blog-cms`, `us-central1`) |
| Project ID | `blog-cms-490815` |
| Domain | `magicpixelmonkey.com` |

---

## Project Structure

```
cms/
├── server.js                   # Express app entry point, all routes
├── Dockerfile
├── package.json
├── public/
│   ├── admin/
│   │   ├── index.html          # Post dashboard
│   │   ├── editor.html         # Quill post editor
│   │   ├── media.html          # Media library
│   │   ├── analytics.html      # Analytics dashboard
│   │   └── js/
│   │       ├── editor.js
│   │       ├── media.js
│   │       └── analytics.js
│   ├── css/
│   │   ├── blog.css            # Public blog styles
│   │   └── admin.css           # Admin styles
│   ├── js/api.js               # Shared API client
│   ├── login.html
│   ├── forgot-password.html
│   └── reset-password.html
└── src/
    ├── middleware/
    │   └── auth.js             # JWT cookie verification
    ├── routes/
    │   ├── auth.js             # Login, logout, password reset
    │   ├── posts.js            # Post CRUD
    │   ├── media.js            # Image upload/delete
    │   ├── scheduler.js        # Cloud Scheduler webhook
    │   └── analytics.js        # Analytics summary API
    ├── services/
    │   ├── firestore.js        # All Firestore queries
    │   ├── storage.js          # GCS upload/delete
    │   ├── analytics.js        # Page view tracking + summary
    │   └── email.js            # Password reset emails
    └── views/blog/
        ├── index.ejs           # Homepage (post list)
        ├── post.ejs            # Single post page
        └── 404.ejs             # Custom 404 page
```

---

## Features

- **Posts** — create, edit, delete, draft, publish, schedule
- **Quill WYSIWYG editor** — rich text HTML editor; legacy Markdown posts are auto-detected and rendered with marked.js
- **Tags** — tag posts, filter by tag on homepage
- **Media library** — upload images to GCS, insert URLs into posts
- **Privacy-focused analytics** — server-side tracking, no cookies, no IP addresses stored; dashboard at `/admin/analytics`
- **RSS feed** — `/feed.xml`
- **XML sitemap** — `/sitemap.xml`
- **robots.txt** — `/robots.txt`
- **Password reset** — email-based via SMTP (requires `SMTP_*` env vars)
- **Scheduled posts** — set a future publish date; Cloud Scheduler triggers publishing
- **Custom 404 page** — styled with background image

---

## Environment Variables

Set in Cloud Run via `--update-env-vars`. Sensitive values should be stored in Secret Manager.

| Variable | Description |
|---|---|
| `PORT` | Auto-set by Cloud Run to `8080` |
| `NODE_ENV` | Set to `production` |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `GCP_PROJECT_ID` | `blog-cms-490815` |
| `GCS_BUCKET_NAME` | `blog-cms-media` |
| `BLOG_TITLE` | `Magic Pixel Monkey` |
| `BLOG_DESCRIPTION` | Short site description for meta tags |
| `BLOG_URL` | `https://magicpixelmonkey.com` (used for canonical URLs and schema) |
| `SCHEDULER_SECRET` | Shared secret for Cloud Scheduler webhook |
| `INIT_ADMIN_USERNAME` | Seed first admin — set once then remove |
| `INIT_ADMIN_PASSWORD` | Seed first admin — set once then remove |
| `INIT_ADMIN_EMAIL` | Seed first admin — set once then remove |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (usually `587`) |
| `SMTP_USER` | SMTP username/email |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address for reset emails |

---

## Deployment

All CMS code lives on branch `claude/blog-cms-system-rZ1UO`. The `master` branch does not contain the CMS.

### Deploy from your local machine

```bash
cd ~/cpt-cheezbrgr.github.io
git pull origin claude/blog-cms-system-rZ1UO
cd cms
gcloud builds submit --tag gcr.io/blog-cms-490815/blog-cms .
gcloud run deploy blog-cms \
  --image gcr.io/blog-cms-490815/blog-cms \
  --region us-central1 \
  --project blog-cms-490815
```

### Update an environment variable without full redeploy

```bash
gcloud run services update blog-cms \
  --update-env-vars KEY=value \
  --region us-central1 \
  --project blog-cms-490815
```

---

## Security

| Protection | Implementation |
|---|---|
| Security headers | `helmet` (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) |
| Brute-force protection | `express-rate-limit` — 10 requests per 15 min on all `/api/auth/*` routes |
| Auth cookies | `httpOnly`, `secure` (production), `sameSite=lax`, 7-day expiry |
| Passwords | bcrypt, 12 rounds |
| JWT | Signed tokens, verified on every protected request |
| File uploads | JPEG, PNG, GIF, WebP only — SVG blocked (XSS risk) |
| Upload size | 10MB per file, 2MB JSON body limit |
| Password reset tokens | Expire after 1 hour, single use |
| Email enumeration | Forgot-password always returns success regardless of email existence |
| Admin link | Removed from public blog header |

---

## SEO

| Feature | Detail |
|---|---|
| JSON-LD structured data | `Article` schema on post pages, `WebSite` schema on homepage |
| Open Graph | `og:type`, `og:title`, `og:description`, `og:url`, `og:image` on all pages |
| Twitter Cards | `summary` or `summary_large_image` depending on cover image |
| Canonical URLs | `<link rel="canonical">` on all pages using `BLOG_URL` env var |
| Sitemap | `/sitemap.xml` — submitted to Google Search Console |
| RSS | `/feed.xml` — linked in `<head>` |
| Robots.txt | `/robots.txt` — disallows admin/api routes, references sitemap |

---

## Analytics

Privacy-focused, server-side only. No cookies, no IP addresses stored.

**Tracked per page view:**
- URL path
- Device type (mobile / desktop, derived from User-Agent)
- Referrer domain only (no full URL, no query strings)
- Date (YYYY-MM-DD)

**Dashboard at `/admin/analytics`:**
- Total views (all time, last 7 days, today)
- Daily bar chart
- Top pages table
- Top referrers table
- Device breakdown with percentages
- Range selector (7 / 30 / 90 days)

Admin routes and API endpoints are excluded from tracking.

---

## Data Model (Firestore)

**Collection: `posts`**
```
title         string
slug          string      (URL-friendly, auto-generated from title)
content       string      (HTML from Quill, or legacy Markdown)
excerpt       string
status        string      ('draft' | 'published' | 'scheduled')
tags          array
coverImage    string      (GCS URL, optional)
authorId      string
createdAt     timestamp
updatedAt     timestamp
publishedAt   timestamp   (set when status → published)
publishAt     timestamp   (for scheduled posts)
```

**Collection: `users`**
```
username      string
email         string
passwordHash  string      (bcrypt, 12 rounds)
resetToken    string      (temporary, expires 1 hour)
resetTokenExpiry  timestamp
createdAt     timestamp
updatedAt     timestamp
```

**Collection: `media`**
```
filename      string      (path in GCS: media/<uuid>.ext)
originalName  string
url           string      (public HTTPS URL)
size          number      (bytes)
mimeType      string
uploadedAt    timestamp
uploadedBy    string      (user ID)
```

**Collection: `analytics`**
```
path          string      (URL path)
device        string      ('mobile' | 'desktop')
referrer      string      (domain only, e.g. 'google.com')
date          string      (YYYY-MM-DD)
timestamp     timestamp
```

---

## How It Works

### Public Blog
The homepage (`/`) queries Firestore for published posts, renders them server-side with EJS, and returns full HTML. Posts are sorted by `publishedAt` in memory (avoids Firestore composite index requirement). Individual posts are at `/post/:slug`. Tag filtering and pagination are built in (8 posts per page).

### Post Editor
The Quill WYSIWYG editor stores HTML. On save, `quill.root.innerHTML` is sent to the API. On the public blog, posts starting with `<` are rendered as HTML directly; anything else is treated as legacy Markdown and rendered with marked.js.

### Admin Authentication
After logging in at `/login`, a JWT token is stored in an httpOnly cookie (7-day expiry). The `requireAuth` middleware verifies this cookie on all `/admin/*` routes and `/api/*` routes (except `/api/auth`).

### Scheduled Posts
Posts can be set to publish at a future date. A Google Cloud Scheduler job calls `POST /api/scheduler/publish-due` on a regular interval. This endpoint authenticates via the `x-scheduler-secret` header and publishes any `scheduled` posts whose `publishAt` time has passed.

### Media Uploads
Images are uploaded to GCS with a UUID filename (`media/<uuid>.ext`) and served from their public GCS URL. The original filename and metadata are stored in Firestore.

---

## Local Development

```bash
cd cms
cp .env.example .env   # fill in values
npm install
npm run dev            # nodemon on http://localhost:8080
```

Requires Application Default Credentials for GCP:
```bash
gcloud auth application-default login
```

---

## Known Issues / Pending

| Issue | Status |
|---|---|
| Password reset returns 500 | SMTP env vars not configured in Cloud Run — set `SMTP_*` variables to fix |
| Admin post list Firestore index | May need a composite index on `status + createdAt` — create at [Firebase Console](https://console.firebase.google.com/project/blog-cms-490815/firestore/indexes) |
| CI/CD not active | Manual deploy only; a `.github/workflows/deploy.yml` stub exists but is unused |
| Cloud Scheduler | Not yet configured — scheduled posts will not auto-publish until set up |
