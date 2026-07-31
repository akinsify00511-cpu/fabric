# Deploying Avenize

## Prerequisites

1. **GitHub Repository** - Code is pushed to GitHub
2. **Supabase Project** - Backend database ready
3. **Vercel Account** - For frontend hosting

---

## Step 1: Connect to Vercel

### Option A: Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign up/login
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository (`akinsify00511-cpu/fabric`)
4. Vercel will auto-detect **Vite** framework

### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy from project folder
cd /workspace/project
vercel
```

---

## Step 2: Configure Environment Variables

In Vercel Dashboard → Project → **Settings** → **Environment Variables**:

| Variable | Value | Where |
|----------|-------|--------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Site Settings |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key | Site Settings |

To find these:
1. Go to [supabase.com](https://supabase.com)
2. Open your project
3. Go to **Settings** → **API**
4. Copy **Project URL** and **anon public** key

---

## Step 3: Run Database Migrations

In Supabase Dashboard → **SQL Editor**, run these migrations in order:

1. **001_initial.sql** through **016_customer_portal.sql**

Or use Supabase CLI:
```bash
supabase db push
```

---

## Step 4: Deploy

### Deploy Preview (test)
```bash
vercel
```

### Deploy to Production
```bash
vercel --prod
```

---

## Step 5: Verify Deployment

1. Visit your Vercel deployment URL
2. Sign up for a new account
3. Complete onboarding
4. Test key features:
   - [ ] Dashboard loads
   - [ ] Can create a deal
   - [ ] Can create a task
   - [ ] Can send a chat message
   - [ ] Calendar works
   - [ ] Branding settings work
   - [ ] 2FA settings work

---

## Custom Domain (Optional)

1. In Vercel → Project → **Settings** → **Domains**
2. Add your domain (e.g., `app.yourcompany.com`)
3. Update DNS records as shown
4. Wait for SSL certificate

---

## Troubleshooting

### Build Fails
- Check environment variables are set
- Run `npm run build` locally to test

### Database Errors
- Verify Supabase URL and keys are correct
- Run migrations in Supabase SQL Editor

### CORS Errors
- In Supabase Dashboard → Settings → API
- Check Site URL matches your Vercel URL

---

## Support

For issues, check:
1. Vercel deployment logs
2. Supabase logs
3. Browser console
