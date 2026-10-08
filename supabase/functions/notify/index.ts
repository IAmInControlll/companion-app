// Receives row changes from database triggers (see migrations/*_push_triggers.sql)
// and fans them out as FCM messages. Every message carries a `widgets` data field so the
// recipient's phone knows which home-screen widgets to redraw, even if the app is closed.
//
// Env:
//   NOTIFY_SECRET              shared secret, must match the Vault secret `notify_secret`
//   FIREBASE_SERVICE_ACCOUNT   the Firebase service-account JSON (one line)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

type Payload = {
  table: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  record: Record<string, any>;
  old_record: Record<string, any> | null;
  actor: string | null;
};

type Outgoing = {
  recipients: string[];
  data: Record<string, string>;
  notification?: { title: string; body: string; tag: string };
};

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const NUDGE_TEXT: Record<string, string> = {
  miss_you: 'misses you 💗',
  hug: 'sent you a hug 🤗',
  kiss: 'sent you a kiss 😘',
  poke: 'poked you 👉',
  high_five: 'high-fived you ✋',
  love: 'loves you ❤️',
};

Deno.serve(async (req) => {
  if (req.headers.get('x-notify-secret') !== Deno.env.get('NOTIFY_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const payload = (await req.json()) as Payload;
  try {
    const out = await buildMessage(payload);
    if (!out || out.recipients.length === 0) return Response.json({ sent: 0 });
    const sent = await sendToUsers(out);
    return Response.json({ sent });
  } catch (e) {
    console.error('notify failed', payload.table, payload.op, e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});

async function profileName(userId: string | null | undefined): Promise<string> {
  if (!userId) return 'Someone';
  const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return data?.display_name ?? 'Someone';
}

async function spaceName(spaceId: string): Promise<string> {
  const { data } = await supabase.from('spaces').select('name').eq('id', spaceId).maybeSingle();
  return data?.name ?? '';
}

async function membersExcept(spaceId: string, exclude: string | null | undefined): Promise<string[]> {
  const { data } = await supabase.from('space_members').select('user_id').eq('space_id', spaceId);
  return (data ?? []).map((r) => r.user_id).filter((id) => id !== exclude);
}

async function coMembers(userId: string): Promise<string[]> {
  const { data: mine } = await supabase.from('space_members').select('space_id').eq('user_id', userId);
  const spaceIds = (mine ?? []).map((r) => r.space_id);
  if (spaceIds.length === 0) return [];
  const { data } = await supabase.from('space_members').select('user_id').in('space_id', spaceIds);
  return [...new Set((data ?? []).map((r) => r.user_id))].filter((id) => id !== userId);
}

const BUCKET = 'media';

/** Remove a deleted post's files; members' widgets redraw so it disappears there too. */
async function cleanupPost(r: Record<string, any>, actor: string | null): Promise<Outgoing> {
  const paths = [r.image_path, r.doc_path].filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (paths.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) console.error('post cleanup failed', r.id, error);
  }
  return {
    recipients: await membersExcept(r.space_id, actor),
    data: { type: 'post-deleted', space_id: r.space_id, widgets: r.kind === 'photo' ? 'Photo' : 'Chalkboard' },
  };
}

/** Remove everything stored under a deleted space's folder. */
async function cleanupSpace(spaceId: string) {
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(spaceId, { limit: 1000 });
    if (error) return console.error('space cleanup list failed', spaceId, error);
    if (!data?.length) return;
    const { error: rmError } = await supabase.storage.from(BUCKET).remove(data.map((f) => `${spaceId}/${f.name}`));
    if (rmError) return console.error('space cleanup failed', spaceId, rmError);
  }
}

async function buildMessage({ table, op, record: r, old_record: old, actor }: Payload): Promise<Outgoing | null> {
  switch (table) {
    case 'posts': {
      if (op === 'DELETE') return cleanupPost(r, actor);
      const name = await profileName(r.author_id);
      const what =
        r.kind === 'drawing' ? 'drew on your board ✏️' : r.kind === 'photo' ? 'shared a photo 📷' : 'left you a note 📝';
      return {
        recipients: await membersExcept(r.space_id, r.author_id),
        data: { type: 'post', space_id: r.space_id, widgets: r.kind === 'photo' ? 'Photo,Streak' : 'Chalkboard,Streak' },
        notification: {
          title: `${name} ${what}`,
          body: r.kind === 'note' ? String(r.body).slice(0, 120) : 'Tap to see it',
          tag: `post-${r.space_id}`,
        },
      };
    }
    case 'nudges': {
      const name = await profileName(r.sender_id);
      return {
        recipients: await membersExcept(r.space_id, r.sender_id),
        data: { type: 'nudge', space_id: r.space_id, widgets: 'MissYou,Streak' },
        notification: { title: `${name} ${NUDGE_TEXT[r.kind] ?? 'nudged you'}`, body: '', tag: `nudge-${r.space_id}` },
      };
    }
    case 'answers': {
      const name = await profileName(r.user_id);
      return {
        recipients: await membersExcept(r.space_id, r.user_id),
        data: { type: 'answer', space_id: r.space_id, widgets: 'Streak' },
        notification: {
          title: `${name} answered today's question 💬`,
          body: 'Answer too to unlock their reply',
          tag: `answer-${r.space_id}`,
        },
      };
    }
    case 'reactions': {
      const { data: post } = await supabase.from('posts').select('author_id, space_id, kind').eq('id', r.post_id).maybeSingle();
      if (!post || post.author_id === r.user_id) return null;
      if (op === 'UPDATE' && old?.emoji === r.emoji) return null;
      const name = await profileName(r.user_id);
      return {
        recipients: [post.author_id],
        data: { type: 'reaction', space_id: post.space_id, widgets: '' },
        notification: { title: `${name} reacted ${r.emoji}`, body: `to your ${post.kind}`, tag: `reaction-${r.post_id}` },
      };
    }
    case 'events': {
      const recipients = await membersExcept(r.space_id, op === 'INSERT' ? r.created_by : actor);
      const base = { recipients, data: { type: 'event', space_id: r.space_id, widgets: 'Countdown' } };
      if (op !== 'INSERT') return base;
      const name = await profileName(r.created_by);
      return { ...base, notification: { title: `${name} added a countdown`, body: `${r.emoji} ${r.title}`, tag: `event-${r.id}` } };
    }
    case 'space_members': {
      const [name, sName] = await Promise.all([profileName(r.user_id), spaceName(r.space_id)]);
      return {
        recipients: await membersExcept(r.space_id, r.user_id),
        data: { type: 'member', space_id: r.space_id, widgets: '*' },
        notification: { title: `${name} joined ${sName} 🎉`, body: 'Say hi with a drawing!', tag: `member-${r.space_id}` },
      };
    }
    case 'profiles': {
      const recipients = await coMembers(r.id);
      const moodChanged = old && (old.mood_emoji !== r.mood_emoji || old.mood_text !== r.mood_text) && r.mood_emoji;
      const msg: Outgoing = { recipients, data: { type: 'profile', space_id: '', widgets: 'Mood,Distance,MissYou' } };
      if (moodChanged) {
        msg.notification = {
          title: `${r.display_name} is feeling ${r.mood_emoji}`,
          body: r.mood_text ?? '',
          tag: `mood-${r.id}`,
        };
      }
      return msg;
    }
    case 'spaces':
      if (op === 'DELETE') {
        await cleanupSpace(r.id);
        return null;
      }
      return {
        recipients: await membersExcept(r.id, actor),
        data: { type: 'space', space_id: r.id, widgets: 'Countdown' },
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// FCM HTTP v1
// ---------------------------------------------------------------------------

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };
let cachedToken: { value: string; expiresAt: number } | null = null;

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const jwt = `${header}.${claims}.${b64url(sig)}`;

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) throw new Error(`OAuth failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

async function sendToUsers(out: Outgoing): Promise<number> {
  const { data: devices } = await supabase.from('devices').select('token').in('user_id', out.recipients);
  if (!devices?.length) return 0;

  const sa = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!) as ServiceAccount;
  const token = await accessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  // HIGH priority wakes the app's background handler (widget refresh) even when it's killed.
  // FCM deprioritizes apps whose high-priority messages don't show a notification, so silent
  // widget-only updates (location, name/avatar, edits) go NORMAL and land when the phone wakes.
  // When there's a notification, Android shows it natively; the app adds an in-app toast if foregrounded.
  const message = (deviceToken: string) => ({
    token: deviceToken,
    data: out.data,
    android: {
      priority: out.notification ? 'HIGH' : 'NORMAL',
      ttl: '86400s',
      ...(out.notification
        ? { notification: { tag: out.notification.tag, color: '#F7A8C4' } }
        : {}),
    },
    ...(out.notification ? { notification: { title: out.notification.title, body: out.notification.body } } : {}),
  });

  const results = await Promise.all(
    devices.map(async ({ token: deviceToken }) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message(deviceToken) }),
      });
      if (res.ok) return true;
      const body = await res.text();
      if (res.status === 404 || body.includes('UNREGISTERED') || body.includes('INVALID_ARGUMENT')) {
        await supabase.from('devices').delete().eq('token', deviceToken);
      } else {
        console.error('FCM send failed', res.status, body);
      }
      return false;
    }),
  );
  return results.filter(Boolean).length;
}
