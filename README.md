# Company Intelligence Monitor

Automatically monitors companies for signals (product launches, executive hires,
M&A activity, job spikes, press releases, website changes) and emails you a
weekly digest — powered by Claude.

---

## Setup Guide (step by step)

### Step 1 — Get your accounts & API keys

| Service | Where | What you need |
|---|---|---|
| GitHub | github.com | Free account |
| Vercel | vercel.com | Free account (sign up with GitHub) |
| Anthropic | console.anthropic.com | API key + $5 credit |
| Resend | resend.com | API key (free tier) |

---

### Step 2 — Put the code on GitHub

1. Go to github.com → click **"New repository"**
2. Name it `company-intel-monitor` → click **Create repository**
3. On the next page, click **"uploading an existing file"**
4. Upload all the files from this folder (keeping the folder structure)
5. Click **Commit changes**

---

### Step 3 — Add your companies

Open `api/cron.js` in GitHub (click the file, then the pencil icon to edit).

Find this section and add your companies:
```js
const COMPANIES = [
  { name: "Salesforce",  url: "salesforce.com" },
  { name: "HubSpot",     url: "hubspot.com" },
  // Add yours here:
  { name: "Your Company", url: "yourcompany.com" },
];
```

Also update `RECIPIENT_EMAIL` to your email address (or set it as an env var in Step 5).

---

### Step 4 — Deploy to Vercel

1. Go to vercel.com → click **"Add New Project"**
2. Click **"Import Git Repository"** → select your `company-intel-monitor` repo
3. Leave all settings as default → click **Deploy**
4. Wait ~60 seconds for the first deploy to finish

---

### Step 5 — Add your secret keys to Vercel

In Vercel → your project → **Settings** → **Environment Variables**, add these:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your key from console.anthropic.com (starts with `sk-ant-`) |
| `RESEND_API_KEY` | Your key from resend.com (starts with `re_`) |
| `CRON_SECRET` | Make up any random string, e.g. `mysecret123` |
| `RECIPIENT_EMAIL` | Your email address |

After adding them, go to **Deployments** → click the three dots on the latest → **Redeploy**.

---

### Step 6 — Set up your email domain in Resend

By default, Resend needs you to verify a domain to send from. Two options:

**Option A (easiest):** Use Resend's free shared domain
- In `lib/email.js`, change the `from` field to: `onboarding@resend.dev`
- This works immediately, no domain needed

**Option B:** Add your own domain
- In Resend → Domains → Add Domain → follow their DNS instructions
- Then update the `from` field in `lib/email.js` to `digest@yourdomain.com`

---

### Step 7 — Choose your schedule

The default is every Monday at 8am UTC. To change it, edit `vercel.json`:

```json
"schedule": "0 8 * * 1"
```

Cron format: `minute hour day month weekday`
- Every Monday 8am UTC: `0 8 * * 1`
- Every day 7am UTC: `0 7 * * *`
- Every Friday 9am UTC: `0 9 * * 5`

---

### Step 8 — Test it

To trigger a manual run without waiting for the schedule:
1. In Vercel → your project → **Functions** tab
2. Find `/api/cron` → click **Test** (or just visit the URL with your secret)

Or test locally:
```bash
npm install
ANTHROPIC_API_KEY=sk-... RESEND_API_KEY=re_... RECIPIENT_EMAIL=you@you.com node test-run.js
```

---

## Estimated costs

| Service | Cost |
|---|---|
| Vercel | Free (Hobby plan covers cron jobs) |
| Anthropic API | ~$0.01–0.05 per company per run |
| Resend | Free up to 3,000 emails/month |
| **Total for 20 companies, weekly** | **~$0.10–1.00/month** |

---

## Customizing signal types

Claude is instructed to look for: product launches, executive changes, M&A activity,
press releases, job posting spikes, and website changes.

To focus on specific signals, edit the prompt in `lib/scraper.js` — find the
`analyzeWithClaude` function and modify the instruction text.
