# Blog CMS

A lightweight, secure personal blog CMS built with Node.js, hosted on Google Cloud Run with Firestore and Cloud Storage.

## Features

- **Markdown editor** (EasyMDE) with live preview
- **Schedule posts** — set a future publish date/time
- **Drafts** — save without publishing
- **Tags** — tag and filter posts
- **Media library** — upload images to Cloud Storage with drag-and-drop
- **Cover images** — per-post cover images
- **Public blog** — server-side rendered for SEO
- **Secure auth** — bcrypt passwords, JWT in httpOnly cookies
- **Password reset** — via email link
- **Cloud Scheduler** — automated scheduled post publishing

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + Express |
| Database | Google Cloud Firestore |
| File storage | Google Cloud Storage |
| Hosting | Google Cloud Run |
| Auth | JWT + bcrypt |
| Editor | EasyMDE (Markdown) |
| Templates | EJS (public blog SSR) |

---

## Local Development

### Prerequisites
- Node.js 20+
- Google Cloud project with Firestore and Cloud Storage enabled
- A GCS bucket (set to uniform access / public read)

### Setup

```bash
cd cms
cp .env.example .env
# Edit .env with your values

npm install
npm run dev
```

The app runs at `http://localhost:8080`.

**First run:** The admin user is created automatically from `INIT_ADMIN_*` env vars if no users exist. Change the password immediately after first login.

---

## Google Cloud Setup

### 1. Enable APIs
```bash
gcloud services enable run.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com
```

### 2. Create Firestore database
```bash
gcloud firestore databases create --region=us-central1
```

### 3. Create Cloud Storage bucket
```bash
gsutil mb -l US-CENTRAL1 gs://YOUR_BUCKET_NAME
gsutil iam ch allUsers:objectViewer gs://YOUR_BUCKET_NAME
```

### 4. Create secrets in Secret Manager
```bash
echo -n "your-long-jwt-secret" | gcloud secrets create blog-cms-jwt-secret --data-file=-
echo -n "your-scheduler-secret" | gcloud secrets create blog-cms-scheduler-secret --data-file=-
# ... repeat for all secrets listed in deploy.yml
```

### 5. Add GitHub Actions secrets
In your GitHub repo → Settings → Secrets:
- `GCP_PROJECT_ID` — your GCP project ID
- `GCP_SA_KEY` — JSON key of a service account with roles: Cloud Run Admin, Storage Admin, Firestore User, Secret Manager Accessor

### 6. Set up Cloud Scheduler (for scheduled posts)
```bash
gcloud scheduler jobs create http blog-cms-publish \
  --schedule="*/15 * * * *" \
  --uri="https://YOUR_CLOUD_RUN_URL/api/scheduler/publish-due" \
  --http-method=POST \
  --headers="x-scheduler-secret=YOUR_SCHEDULER_SECRET" \
  --location=us-central1
```

---

## Deployment

Push to `main` — GitHub Actions builds the Docker image, pushes to GCR, and deploys to Cloud Run automatically.

Manual deploy:
```bash
cd cms
gcloud run deploy blog-cms \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

---

## Project Structure

```
cms/
├── server.js              # Express app + routing
├── src/
│   ├── middleware/
│   │   └── auth.js        # JWT cookie middleware
│   ├── routes/
│   │   ├── auth.js        # Login, logout, password reset
│   │   ├── posts.js       # Post CRUD
│   │   ├── media.js       # Image upload/delete
│   │   └── scheduler.js   # Cloud Scheduler endpoint
│   ├── services/
│   │   ├── firestore.js   # All DB operations
│   │   ├── storage.js     # GCS upload/delete
│   │   └── email.js       # Nodemailer (password reset)
│   └── views/blog/        # EJS templates (public blog)
├── public/
│   ├── css/
│   │   ├── blog.css       # Public blog styles
│   │   └── admin.css      # Admin panel styles
│   ├── js/api.js          # Shared API client
│   ├── login.html
│   ├── forgot-password.html
│   ├── reset-password.html
│   └── admin/
│       ├── index.html     # Post dashboard
│       ├── editor.html    # Post editor
│       ├── media.html     # Media library
│       └── js/
│           ├── dashboard.js
│           ├── editor.js
│           └── media.js
├── Dockerfile
├── .env.example
└── .github/workflows/deploy.yml
```
