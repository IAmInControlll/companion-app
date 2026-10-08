import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getActiveSpaceId, setActiveSpaceId as persistActiveSpace } from '@/widgets/data';
import { refreshWidgets } from '@/widgets/task-handler';

import { getProfile, listSpaces, type SpaceWithMembers } from './api';
import { listenForTokenRefresh, registerForPush, unregisterPush } from './push';
import { supabase } from './supabase';
import type { Profile } from './types';

type SessionCtx = {
  ready: boolean;
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  spaces: SpaceWithMembers[];
  /** Spaces have loaded at least once for the current user (possibly from the offline cache). */
  spacesLoaded: boolean;
  /** The last load failed and nothing was cached, so we can't tell whether the user has spaces. */
  loadFailed: boolean;
  activeSpace: SpaceWithMembers | null;
  setActiveSpace: (id: string) => void;
  /**
   * Onboarding is mid-way (invite / add-widget steps) after creating or joining a space. Keeps the
   * onboarding screen up even though the space now exists (live updates refresh it early).
   */
  onboardingOpen: boolean;
  setOnboardingOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionCtx | null>(null);

type Loaded = { userId: string; profile: Profile | null; spaces: SpaceWithMembers[] };
const cacheKey = (userId: string) => `shell-cache:${userId}`;

async function loadShell(userId: string): Promise<Loaded> {
  const [profile, spaces] = await Promise.all([getProfile(userId), listSpaces()]);
  const loaded = { userId, profile, spaces };
  AsyncStorage.setItem(cacheKey(userId), JSON.stringify(loaded)).catch(() => {});
  return loaded;
}

async function cachedShell(userId: string): Promise<Loaded | null> {
  const raw = await AsyncStorage.getItem(cacheKey(userId)).catch(() => null);
  return raw ? (JSON.parse(raw) as Loaded) : null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  // Loaded data is tagged with the user it belongs to, so signing out/in never shows stale data.
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const userId = session?.user.id ?? null;
  const current = loaded && loaded.userId === userId ? loaded : null;
  const profile = current?.profile ?? null;
  const spaces = useMemo(() => current?.spaces ?? [], [current]);
  const spacesLoaded = !!current;
  const loadFailed = !current && !!userId && failedFor === userId;
  const hasSpace = spaces.length > 0;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    getActiveSpaceId().then(setActiveId);
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoaded(await loadShell(userId));
    setFailedFor(null);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // Offline or flaky network: fall back to the last copy rather than treating the user as
    // having no spaces (which would bounce them to onboarding).
    loadShell(userId)
      .then((l) => {
        setLoaded(l);
        setFailedFor(null);
      })
      .catch(async () => {
        const cached = await cachedShell(userId);
        if (cached) setLoaded(cached);
        else setFailedFor(userId);
      });

    // Retry when the app comes back to the foreground (e.g. after reconnecting).
    const appState = AppState.addEventListener('change', (st) => {
      if (st === 'active') refresh().catch(() => {});
    });

    // Membership / profile changes (someone joins, mood updates...) refresh the shell.
    const channel = supabase
      .channel(`shell:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => refresh().catch(() => {}))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'space_members' }, () => refresh().catch(() => {}))
      .subscribe();

    return () => {
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  // Ask for notifications once there's someone to hear from, not on the sign-in screen.
  useEffect(() => {
    if (!userId || !hasSpace) return;
    registerForPush().catch(() => {});
    return listenForTokenRefresh();
  }, [userId, hasSpace]);

  const activeSpace = useMemo(() => spaces.find((s) => s.id === activeId) ?? spaces[0] ?? null, [spaces, activeId]);

  const setActiveSpace = useCallback((id: string) => {
    setActiveId(id);
    persistActiveSpace(id).then(() => refreshWidgets('*'));
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush();
    if (userId) await AsyncStorage.removeItem(cacheKey(userId)).catch(() => {});
    await supabase.auth.signOut();
    refreshWidgets('*');
  }, [userId]);

  const value: SessionCtx = {
    ready,
    session,
    userId,
    profile,
    spaces,
    spacesLoaded,
    loadFailed,
    activeSpace,
    setActiveSpace,
    onboardingOpen,
    setOnboardingOpen,
    refresh,
    signOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

/**
 * Screens opened from a widget deep link carry `?space=<id>`: make that the active space so
 * the post goes where the widget pointed, not wherever the app was last left.
 */
export function useSpaceParam(spaceParam: string | undefined) {
  const { activeSpace, spaces, setActiveSpace } = useSession();
  const activeId = activeSpace?.id;
  useEffect(() => {
    if (spaceParam && spaceParam !== activeId && spaces.some((s) => s.id === spaceParam)) setActiveSpace(spaceParam);
  }, [spaceParam, activeId, spaces, setActiveSpace]);
}

/** For screens that only render once signed in with a space. */
export function useSpace() {
  const s = useSession();
  if (!s.activeSpace || !s.userId) throw new Error('No active space');
  const others = s.activeSpace.members.filter((m) => m.user_id !== s.userId);
  return { ...s, space: s.activeSpace, userId: s.userId, others };
}
