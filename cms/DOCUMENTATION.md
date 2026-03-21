# Magic Pixel Monkey Blog CMS — Documentation

## Overview

This is a lightweight, self-hosted blog CMS built on Node.js and deployed to Google Cloud Run. It has two interfaces:

- **Public blog** — server-rendered, accessible at `magicpixelmonkey.com`
- **Admin dashboard** — single-page app accessible at `magicpixelmonkey.com/admin`

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20 (Alpine Linux container) |
| Web framework | Express.js |
| Templating (public blog) | EJS |
| Database | Google Cloud Firestore |
| File storage | Google Cloud Storage |
| Authentication | JWT tokens (HTTP-only cookies) |
| Markdown rendering | marked.js |
| Password hashing | bcryptjs |
| Email (password reset) | Nodemailer via SMTP (Gmail) |
| Hosting | Google Cloud Run (serverless, auto-scaling) |
| CI/CD | GitHub Actions |
| Container registry | Google Container Registry (GCR) |

---

## Project Structure

```
cms/
├── server.js                   # Express app entry point, route definitions
├── Dockerfile                  # Container build config
├── package.json                # Dependencies and scripts
├── .env.example                # Environment variable reference
├── public/
│   ├── admin/
│   │   ├── index.html          # Admin dashboard
│   │   ├── editor.html         # Post editor
│   │   ├── media.html          # Media library
│   │   └── js/                 # Admin JavaScript
│   ├── css/
│   │   ├── blog.css            # Public blog styles
│   │   └── admin.css           # Admin dashboard styles
│   ├── login.html
│   ├── forgot-password.html
│   └── reset-password.html
└── src/
    ├── middleware/
    │   └── auth.js             # JWT auth middleware
    ├── routes/
    │   ├── auth.js             # Login, logout, password reset
    │   ├── posts.js            # CRUD for blog posts
    │   ├── media.js            # Image upload and management
    │   └── scheduler.js        # Webhook for scheduled publishing
    ├── services/
    │   ├── firestore.js        # All database operations
    │   ├── storage.js          # Google Cloud Storage uploads
    │   └── email.js            # Password reset emails
    └── views/
        └── blog/
            ├── index.ejs       # Blog homepage
            ├── post.ejs        # Single post view
            └── 404.ejs         # Error page
```

---

## How It Works

### Public Blog
The homepage (`/`) queries Firestore for published posts, renders them server-side with EJS, and returns full HTML. Individual posts are served at `/post/:slug`. Tag filtering and pagination are built in (8 posts per page).

### Admin Dashboard
The admin is protected by JWT authentication. After logging in at `/login`, a JWT token is stored in an HTTP-only cookie (valid 7 days). All admin API calls (`/api/posts`, `/api/media`) require this cookie.

### Scheduled Posts
Posts can be set to publish at a future date/time. A Google Cloud Scheduler job calls `POST /api/scheduler/publish-due` on a regular interval — this endpoint finds any posts with `status=scheduled` and a `publishAt` time in the past, and flips them to `published`.

### Media
Images are uploaded to Google Cloud Storage and served from their public GCS URLs. Metadata (filename, size, uploader) is stored in Firestore.

---

## Environment Variables

These are stored as **Google Secret Manager secrets** in production — you do not edit a `.env` file on the server. To change a value, update the secret in the GCP console.

| Variable | Purpose |
|----------|---------|
| `BLOG_TITLE` | Blog name displayed in the header |
| `BLOG_DESCRIPTION` | Meta description for the homepage |
| `JWT_SECRET` | Signs authentication tokens (long random string) |
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `GCS_BUCKET_NAME` | Cloud Storage bucket for media uploads |
| `SMTP_HOST` | Email server (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | Email port (e.g. `587`) |
| `SMTP_USER` | Email address for sending password resets |
| `SMTP_PASS` | Gmail app password |
| `EMAIL_FROM` | From address on password reset emails |
| `SCHEDULER_SECRET` | Shared secret for the scheduled publishing webhook |

---

## Deployment

### Manual Deploy (from your machine)

From inside the `cms/` directory:

```bash
gcloud run deploy blog-cms \
  --source . \
  --region us-central1 \
  --project blog-cms-490815
```

This builds a new Docker image using Cloud Build and deploys it to Cloud Run. Takes about 2–3 minutes.

### Automatic Deploy (GitHub Actions)

A GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically deploys whenever you push changes to the `main` branch that affect files inside `cms/`. It:

1. Builds a Docker image and pushes it to Google Container Registry
2. Deploys the new image to Cloud Run with all secrets from Secret Manager

**Required GitHub secrets** (set in repo Settings → Secrets):
- `GCP_PROJECT_ID` — your GCP project ID
- `GCP_SA_KEY` — service account JSON key with Cloud Run and GCR permissions

---

## Making Updates

### Changing blog content or settings

| What to change | Where |
|---------------|-------|
| Blog title or description | Update the `blog-cms-blog-title` / `blog-cms-blog-desc` secrets in GCP Secret Manager, then redeploy |
| Blog styles (fonts, colors, layout) | Edit `public/css/blog.css` |
| Admin styles | Edit `public/css/admin.css` |
| Homepage template | Edit `src/views/blog/index.ejs` |
| Single post template | Edit `src/views/blog/post.ejs` |
| Posts per page | Edit the `limit: 8` value in `server.js` line ~48 |

### Adding a new blog post

1. Go to `magicpixelmonkey.com/login`
2. Log in with your admin credentials
3. Click **New Post** in the dashboard
4. Write in Markdown, add tags, optionally set a cover image
5. **Save as Draft** to save without publishing, or **Publish** to make it live immediately, or set a **Publish At** date for scheduled publishing

### Deploying code changes

After editing any file in the `cms/` directory:

```bash
# From inside the cms/ directory
gcloud run deploy blog-cms --source . --region us-central1 --project blog-cms-490815
```

Or push to the `main` branch and GitHub Actions will deploy automatically.

### Updating a Secret Manager value (e.g. blog title)

```bash
echo -n "New Blog Title" | gcloud secrets versions add blog-cms-blog-title \
  --data-file=- --project blog-cms-490815
```

Then redeploy so the new value is picked up.

---

## Local Development

1. Copy `.env.example` to `.env` and fill in your values
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the dev server (auto-restarts on file changes):
   ```bash
   npm run dev
   ```
4. Open `http://localhost:8080`

Note: Local development requires a Google Cloud service account JSON key and a Firestore database in your GCP project. Set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json` in your `.env` file.

---

## Data Model (Firestore)

**Collection: `posts`**
```
title         string
slug          string      (URL-friendly, auto-generated from title)
content       string      (Markdown)
excerpt       string
status        string      ('draft' | 'published' | 'scheduled')
tags          array
coverImage    string      (URL, optional)
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
resetToken    string      (temporary, expires in 1 hour)
createdAt     timestamp
updatedAt     timestamp
```

**Collection: `media`**
```
filename      string      (path in GCS bucket)
originalName  string
url           string      (public HTTPS URL)
size          number      (bytes)
mimeType      string
uploadedAt    timestamp
uploadedBy    string      (user ID)
```

---

## Security Notes

- The `/login` and `/admin` routes exist but the Admin link has been removed from the public-facing blog header
- JWT tokens are stored in HTTP-only cookies (not accessible to JavaScript)
- All admin API routes require a valid JWT
- Passwords are hashed with bcrypt (12 rounds)
- Media uploads are restricted to images only (JPEG, PNG, GIF, WebP, SVG) with a 10MB size limit
- All secrets are stored in Google Secret Manager, not in the codebase
