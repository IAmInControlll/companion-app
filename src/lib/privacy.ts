// Shown in-app at /privacy. Google Play also needs this at a public URL: host PRIVACY.md
// (same text) somewhere like GitHub Pages and keep the two in sync.

export const PRIVACY_UPDATED = '8 October 2026';

export const PRIVACY_CONTACT = 'iamincontrol.dev@gmail.com';

export const PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What Chalkmates is',
    body: 'Chalkmates lets you share drawings, notes, photos and little check-ins with the people in your spaces. Everything you share is visible only to the members of the space you share it in.',
  },
  {
    title: 'What we store',
    body: [
      '• Your email address and password (hashed), to sign you in.',
      '• Your display name, avatar, colour and mood.',
      '• What you post: drawings, notes, photos, captions, reactions, nudges, answers to daily questions, This-or-That picks and countdowns.',
      '• Your approximate location, only if you turn on location sharing. It is rounded to about 1 km before it is saved and cleared when you turn sharing off.',
      '• A push token for your device, so we can send notifications and refresh your widgets.',
    ].join('\n'),
  },
  {
    title: 'Who can see it',
    body: 'Only the members of the space you post in. We don’t sell your data, show ads, or use analytics or tracking SDKs.',
  },
  {
    title: 'Services we use',
    body: 'Supabase hosts the database, sign-in and file storage. Firebase Cloud Messaging (Google) delivers notifications and widget updates. They process data only to provide those services.',
  },
  {
    title: 'Deleting your data',
    body: 'Delete a post from its page to remove it and its files. Me → Delete account permanently removes your account, your posts and your files, and removes you from every space. Spaces left with no members are deleted too.',
  },
  {
    title: 'Children',
    body: 'Chalkmates is not meant for children under 13.',
  },
  {
    title: 'Contact',
    body: `Questions or requests: ${PRIVACY_CONTACT}`,
  },
];
