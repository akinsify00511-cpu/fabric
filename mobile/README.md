# Avenize Mobile (Android + iOS)

A real React Native + Expo companion for Avenize. It shares the production Supabase backend, tenant/RLS model, authentication and Business OS event layer with the web product while using a mobile-first interaction model.

## Mobile product surface

- **Capture** — natural-language business updates with confirmation before record changes.
- **Snapshot** — live business health, attention exceptions, money, operations, inventory and activity.
- **Tasks** — focused priority queue backed by the same business attention layer.
- **Sarah** — conversational mobile assistant that understands business updates and can safely emit high-confidence events.
- **More** — profile, quick navigation and secure sign-out.
- **Secure auth** — Supabase sessions persisted through device SecureStore.
- **Deep-link foundation** — `avenize://` scheme is configured for auth and future notification/deep-link flows.
- **Camera/media foundation** — native permission declarations are configured for future receipt/document workflows.

## Structure

```text
mobile/
├── App.tsx
├── index.ts
├── app.json
├── eas.json
├── package.json
├── package-lock.json
├── .env.example
└── src/
    ├── theme/
    ├── lib/
    │   ├── supabase.ts
    │   ├── AuthContext.tsx
    │   └── businessOS.ts
    └── components/
        ├── ui.tsx
        ├── LoginScreen.tsx
        ├── CaptureScreen.tsx
        ├── ObserverScreen.tsx
        ├── TasksScreen.tsx
        ├── SarahScreen.tsx
        └── MoreScreen.tsx
```

## Run locally

```bash
cd mobile
npm ci

# PowerShell
$env:EXPO_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"

# macOS/Linux
export EXPO_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"

npx expo start
```

Then press `a` for Android or `i` for an iOS simulator on macOS.

## Device builds

### Android

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

### iOS

```bash
npx expo prebuild --platform ios
cd ios && pod install
open Avenize.xcworkspace
```

For signed TestFlight/App Store builds, use the EAS production profile:

```bash
npx eas build --platform ios --profile production
npx eas build --platform android --profile production
```

Apple Developer and Google Play/EAS credentials are required for store distribution. They are deliberately not committed to the repository.

## CI

`.github/workflows/mobile.yml` runs mobile TypeScript validation and the existing Android/iOS build pipeline for changes under `mobile/**`.

Required repository secrets for device builds:

- `EXPO_PUBLIC_SUPABASE_URL` (or `VITE_SUPABASE_URL`)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_ANON_KEY`)
- Optional Android Firebase App Distribution values already referenced by CI.

## Safety and product rules

- Never put Supabase service-role keys or payment secrets in the mobile bundle.
- All business mutations go through the authenticated user's tenant/RLS boundary and existing Business OS contracts.
- Sarah does not silently mutate records when confidence is low or the underlying intent requires confirmation.
- Mobile is not a web wrapper: navigation is optimized for fast capture, attention and decision-making.
- Web premium motion libraries remain web-only; native motion should use native-safe animation primitives rather than shipping browser scroll dependencies into the mobile bundle.
