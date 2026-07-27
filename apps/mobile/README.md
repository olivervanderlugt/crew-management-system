# CrewOps Mobile — Expo scaffold

Minimale Expo-app die bewijst dat `packages/core` importeerbaar is in React Native.

## Status
Fase 1: scaffold + core-import bewijs.  
Fase 2: uitbouwen tot crew-portaal met beschikbaarheid + toewijzingen.

## Core-import bewijs
`src/App.tsx` importeert `matchCrew` + `MatchRequest` uit `@crewops/core` en runt de matching engine in React Native context. Dit bewijst dat de gedeelde logica cross-platform werkt.

## Opstarten (vereist: Expo CLI + Expo Go app)

```bash
# Installeer Expo CLI
npm install -g expo-cli

# Vanuit de projectroot:
cd apps/mobile
pnpm install  # of: npm install

# Start de Expo dev server
npx expo start

# Scan de QR-code met Expo Go (iOS/Android)
```

## Dependency-notitie
De mobile-app is bewust NIET opgenomen in de Turborepo-pijplijn om de web-build niet te vertragen. Expo's build-systeem werkt los van Turbo.

Voor native builds (iOS/Android):
```bash
npx expo build:ios   # vereist Apple Developer Account
npx expo build:android
```

## Fase 2 uitbreiding
1. Supabase SSR aanpassen voor React Native (AsyncStorage i.p.v. cookies)
2. Crew-portaal schermen bouwen (beschikbaarheid, toewijzingen, profiel)
3. Push notificaties via Expo Notifications
4. OTA updates via Expo Updates
