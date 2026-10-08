import { useEffect, useRef } from 'react';

import { supabase } from './supabase';

/** Call `onChange` whenever rows for this space change in any of the given tables. */
export function useSpaceRealtime(spaceId: string, tables: string[], onChange: () => void) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
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
