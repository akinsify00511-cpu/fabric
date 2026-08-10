# Avenize Mobile (Android + iOS)

A React Native + Expo app that shares the Avenize brand system, auth, and
Business OS core with the web app. Build artifacts (APK + iOS app) are
hosted as GitHub Actions artifacts on every push to `main`.

## Structure

```
mobile/
├── App.tsx                  # Root: SafeArea + Auth + Navigation
├── index.ts                 # Entry point (registerRootComponent)
├── app.json                 # Expo config (Android + iOS, GitHub hosting)
├── package.json
├── tsconfig.json
└── src/
    ├── theme/index.ts       # Brand tokens (mirrors web avenize-brand.css)
    ├── lib/
    │   ├── supabase.ts      # Hardened client: SecureStore, visible-miss config
    │   ├── AuthContext.tsx   # Session + staff, mirrors web AuthContext
    │   └── businessOS.ts     # Typed bus/freshness/intelligence client
    └── components/
        ├── ui.tsx           # Card, Loader, FreshnessDot, badges
        ├── LoginScreen.tsx
        ├── CaptureScreen.tsx   # "Tell Avenize what happened" + What I Understood
        ├── ObserverScreen.tsx  # Living org snapshot, pull-to-refresh
        └── MoreScreen.tsx      # Links to Intelligence/Simulate/Governance/etc
```

## Run locally

```bash
cd mobile
npm install

# Set your Supabase config (reuse the web env values)
export EXPO_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"

npx expo start
# Press a for Android emulator, i for iOS simulator, w for web
```

## Build for device

### Android APK (local)
```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

### iOS (local, requires macOS + Xcode)
```bash
npx expo prebuild --platform ios
cd ios && pod install
open Avenize.xcworkspace   # then Archive in Xcode for a signed build
```

## GitHub-hosted builds

The workflow at `.github/workflows/mobile.yml` builds both platforms on
every push to `mobile/**` and uploads the artifacts:

| Artifact | Runner | Output |
|----------|--------|--------|
| `avenize-android` | ubuntu-latest | `app-release.apk` |
| `avenize-ios` | macos-14 | `.app` (simulator build) |

Download from **Actions → Build Mobile App → latest run → Artifacts**.

> The iOS artifact is a simulator build (no code signing). For an App
> Store / TestFlight build, set the `EXPO_PUBLIC_*` secrets and run
> `eas build --platform ios` with an Apple Developer account.

## Configuration

Add these as GitHub repository secrets (they fall back to the web names):

- `EXPO_PUBLIC_SUPABASE_URL` (or reuse `VITE_SUPABASE_URL`)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or reuse `VITE_SUPABASE_ANON_KEY`)

## What's implemented (mobile)

- ✅ Auth (sign in / sign up) with SecureStore session persistence
- ✅ AI Capture — natural language → "What I Understood" → raise business event
- ✅ Observer — living org snapshot (attention, money, operations, inventory, live activity), pull-to-refresh
- ✅ Bottom-tab navigation (Capture / Snapshot / Tasks / Chat / More)
- ✅ Brand tokens identical to the web (Google Standard)
- ✅ Hardened Supabase client (visible failure on missing config, never silent)
- ⏳ Tasks, Chat, and the remaining hubs are placeholders on mobile — the web app is the full surface; mobile focuses on capture + snapshot + the most-used flows
