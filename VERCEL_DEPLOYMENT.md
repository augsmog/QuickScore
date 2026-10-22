# SnapScore Vercel Deployment Guide

This guide explains how to deploy the SnapScore Golf Score App to Vercel for web-based previews and friend-group testing.

## Prerequisites

- Node.js 18+ installed locally
- Vercel account (free tier works)
- Vercel CLI: `npm i -g vercel`

## Option 1: Deploy via Vercel CLI (Recommended)

### 1. Install Dependencies

```bash
cd scoresnap
npm install
```

### 2. Build for Web

```bash
npm run web
# Or for production build:
npx expo export --platform web --output-dir dist-web
```

This creates a static web build in `dist-web/` directory.

### 3. Deploy to Vercel

```bash
# First-time setup (run from scoresnap/ directory)
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Project name: snapscore-golf (or your choice)
# - Directory: ./dist-web
# - Settings OK? Yes

# Subsequent deploys:
vercel --prod
```

### 4. Set Environment Variables (Optional)

If you want to enable offline mode explicitly:

```bash
vercel env add EXPO_PUBLIC_OFFLINE_MODE
# Enter value: true
# Select environments: Production, Preview, Development
```

## Option 2: Deploy via Vercel Dashboard

### 1. Export Web Build

```bash
cd scoresnap
npx expo export --platform web --output-dir dist-web
```

### 2. Connect GitHub Repository

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository: `augsmog/QuickScore`
3. Configure project:
   - **Framework Preset**: Other
   - **Root Directory**: `scoresnap`
   - **Build Command**: `npx expo export --platform web --output-dir dist-web`
   - **Output Directory**: `dist-web`
   - **Install Command**: `npm install`

### 3. Add Environment Variables (Dashboard)

In project settings → Environment Variables, add:

```
EXPO_PUBLIC_OFFLINE_MODE=true
```

### 4. Deploy

Click "Deploy" — Vercel will build and deploy automatically.

## Option 3: One-Command Deploy (from repo root)

Create `vercel.json` in `/workspace/scoresnap/`:

```json
{
  "buildCommand": "cd scoresnap && npx expo export --platform web --output-dir dist-web",
  "outputDirectory": "scoresnap/dist-web",
  "installCommand": "cd scoresnap && npm install",
  "framework": null,
  "env": {
    "EXPO_PUBLIC_OFFLINE_MODE": "true"
  }
}
```

Then deploy:

```bash
cd /workspace
vercel
```

## Post-Deployment Configuration

### Custom Domain (Optional)

1. In Vercel dashboard, go to your project
2. Navigate to Settings → Domains
3. Add your custom domain (e.g., `golf.yourdomain.com`)
4. Update DNS records as instructed

### Offline Mode Behavior

When the build is made with `EXPO_PUBLIC_OFFLINE_MODE=true` (explicit opt-in; it is not automatic on web):

- ✅ Auth is bypassed — users land directly on home screen
- ✅ Onboarding auto-completes
- ✅ All data stored locally in browser (IndexedDB/localStorage)
- ✅ No Supabase or backend required
- ⚠️ Camera OCR is not available on web; the Scan screen offers "Enter scorecard as text", which runs the same parser
- ✅ Manual score entry works fully
- ✅ All 29 game types work with manual entry

### Share with Friends

After deployment, share the Vercel URL:

```
https://snapscore-golf.vercel.app
```

Friends can:
- Open in any browser (desktop or mobile)
- Create rounds & enter scores manually
- See live side-game calculations
- View settlement results
- No install or signup required

## Testing Locally Before Deploy

Test the web build locally first:

```bash
cd scoresnap
EXPO_PUBLIC_OFFLINE_MODE=true npx expo export --platform web --output-dir dist-web
npx serve -s dist-web
# Real-app Playwright check (see e2e/web-real-flow.mjs): BASE_URL=http://localhost:3000 node e2e/web-real-flow.mjs
```

## Troubleshooting

### Build Fails

**Issue**: `Module not found: Can't resolve 'react-native-...`

**Fix**: Some native modules won't work on web. The app already has guards for:
- `expo-camera` (disabled on web)
- `expo-haptics` (no-op on web)
- `@react-native-ml-kit/text-recognition` (disabled on web)

If other native modules cause issues, add web-compatible alternatives or conditional imports.

### Large Bundle Size

**Issue**: Web bundle > 5MB

**Fix**: Enable bundle splitting in `metro.config.js`:

```js
module.exports = {
  transformer: {
    // ... existing config
  },
  experimental: {
    treeShaking: true,
  },
};
```

### White Screen on Load

**Issue**: App shows blank screen

**Fix**: Check browser console for errors. Common causes:
- Missing env vars
- localStorage quota exceeded
- Unsupported browser (needs ES2020+)

## CI/CD: Auto-Deploy on Push (Optional)

Vercel auto-deploys when you push to GitHub:

1. Connect GitHub integration in Vercel dashboard
2. Every push to `main` → production deploy
3. Every PR → preview deploy with unique URL

Preview URLs are perfect for testing fixes before merge.

## Performance Notes

- **First Load**: ~3-5s (includes fonts, React, app bundle)
- **Subsequent Loads**: ~500ms (service worker cache)
- **Bundle Size**: ~2.5MB (can be optimized further)
- **Lighthouse Score**: 85+ (aim for 90+ after optimization)

## Cost Estimate

**Vercel Free Tier**:
- ✅ 100GB bandwidth/month
- ✅ Unlimited deployments
- ✅ Free SSL
- ✅ Edge network (fast CDN)

**Expected Usage** (10 friends):
- ~50 MB/user/month → 500 MB total
- Well within free tier

## Next Steps for Production

Before wider release:

1. **Add Analytics**: Vercel Analytics or PostHog
2. **Enable Caching**: Set cache headers for fonts/assets
3. **Optimize Images**: Use WebP, compress assets
4. **Add Error Tracking**: Sentry (already configured)
5. **Test on Mobile Browsers**: Safari, Chrome Mobile
6. **PWA Support**: Add service worker for offline use

## Useful Commands

```bash
# Check build size
npx expo export --platform web --output-dir dist-web

# Clear cache and rebuild
npx expo start -c --web

# Test production build locally
npx serve dist-web --single

# View Vercel deployment logs
vercel logs [deployment-url]
```

## Support

For issues or questions:
- Vercel Docs: https://vercel.com/docs
- Expo Web Docs: https://docs.expo.dev/workflow/web/
- GitHub Issues: Create an issue in the repo
