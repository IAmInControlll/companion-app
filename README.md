# Chalkmates 🖍️

A free, open alternative to paid "draw on your partner's home screen" apps. Draw on a chalkboard,
and it lands on your partner's (or friends') home-screen widget, even when their app is closed.

**Drawing (the core)**
- Chalk, pen, neon, marker, chalk-dust, rainbow brushes + eraser, 6 sizes, 16 colors
- 8 boards (classic green with wooden frame, slate, midnight, plum, blush, paper, mint, night)
- Square / wide / tall canvases
- Text in a chalk hand font and 12 stamps; move, pinch-resize, twist-rotate, duplicate, layer
- Undo/redo, autosaved drafts per space
- **Draw over** their board or photo to reply on top of it
- **Replay**: watch any drawing being drawn stroke by stroke (drawings are stored as vectors)
- Quick chalk notes that auto-fit the board

**Everything else**
- Couples (2 people) or groups (up to 12), multiple spaces per person, invite codes
- 6 widgets on Android and iOS: Chalkboard, Mood, Miss-you (miss you, hug, kiss, poke… right from the widget), Distance, Countdown, Streak
- Moods (54 of them + custom status), nudges (miss you, hug, kiss, poke, high five, love)
- Timeline of who nudged, drew on or reacted to whom, with repeats grouped ("missed you ×24")
- Daily question and This-or-That (hidden for now: `SHOW_QUESTIONS` in `src/lib/features.ts`)
- Streaks, countdowns, anniversary / days together, reactions; boards are kept for good (no deleting)
- Push notifications; widgets refresh instantly via FCM data messages (APNs background pushes on iOS)

See **[SETUP.md](SETUP.md)** to get it running.

## Stack
- Expo SDK 57 (React Native 0.86), Expo Router, React Compiler
- `@shopify/react-native-skia` for the drawing engine (`src/drawing/`)
- `react-native-android-widget` for Android widgets (`src/widgets/`), `expo-widgets` for iOS (`src/widgets/ios/`)
- Supabase (Postgres + RLS, Realtime, Storage, Edge Functions) in `supabase/`
- Firebase Cloud Messaging via `@react-native-firebase/messaging`

## Design system
- **Tokens** in `src/lib/theme.ts`: neutral dark surfaces, one pink accent (primary actions, selection, the heart), chalk inks only for content.
- **Type**: Nunito for everything you operate; the PatrickHand chalk font only for "on the board" moments (wordmark, today's question, big numbers).
- **Components** in `src/components/ui.tsx`: `Button` (one primary per screen), `IconButton`, `Chip` (selection only), `Segmented`, `ListGroup`/`ListRow`, `Sheet`, `Header`, `Icon`.
- **Icons**: Material Symbols subset into `assets/fonts/ChalkIcons-*.ttf`. Add a name in `scripts/build-icons.py`, run `python scripts/build-icons.py` (needs `pip install fonttools`), then use `<Icon name="…" />`. Emoji are content (avatars, moods, reactions), never UI icons.

## Layout
```
index.ts                 entry: registers widget + push headless handlers
src/app/                 screens (Expo Router)
src/drawing/             model, Skia renderer, canvas, toolbars, export/publish
src/widgets/             widget UIs, data loading (headless), task handler; ios/ + refresh.ios.ts for iOS
src/lib/                 Supabase client, API, session, push, location, media cache
supabase/migrations/     schema, RLS, RPCs, push triggers, seed questions
supabase/functions/notify  edge function that sends FCM pushes
```
