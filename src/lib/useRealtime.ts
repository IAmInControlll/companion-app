import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

/**
 * Call `onChange` whenever rows for this space change in any of the given tables, and when the
 * app comes back to the foreground (changes made while it was in the background aren't replayed).
 */
export function useSpaceRealtime(spaceId: string, tables: string[], onChange: () => void) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') cb.current();
    });
    return () => sub.remove();
  }, []);
  const key = tables.join(',');

  useEffect(() => {
    let channel = supabase.channel(`space:${spaceId}:${key}:${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(',')) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `space_id=eq.${spaceId}` }, () =>
        cb.current(),
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [spaceId, key]);
}
