import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { newDoc, type BoardId, type BoardStyle, type Doc, type Item } from './model';

const MAX_HISTORY = 100;

type State = { doc: Doc; past: Item[][]; future: Item[][] };

/**
 * Drawing document with undo/redo. Only item changes are tracked in history;
 * board/aspect changes apply immediately.
 * When `draftKey` is set the doc is autosaved and restored, so leaving the screen never loses work.
 */
export function useDrawingDoc(initial: Doc, draftKey?: string | null) {
  const [state, setState] = useState<State>({ doc: initial, past: [], future: [] });
  // The draft key whose saved doc is currently loaded. When the key changes (e.g. a widget
  // switches the space), the old doc must never be autosaved under the new key.
  const [restoredKey, setRestoredKey] = useState<string | null | undefined>(draftKey ? undefined : null);
  const restored = !draftKey || restoredKey === draftKey;
  const blank = useRef(initial);

  useEffect(() => {
    if (!draftKey) return;
    let cancelled = false;
    AsyncStorage.getItem(draftKey)
      .catch(() => null)
      .then((raw) => {
        if (cancelled) return;
        let saved: Doc | null = null;
        try {
          saved = raw ? (JSON.parse(raw) as Doc) : null;
        } catch {
          // corrupt draft: start fresh
        }
        setState({ doc: saved?.v === 1 && saved.items?.length ? saved : blank.current, past: [], future: [] });
        setRestoredKey(draftKey);
      });
    return () => {
      cancelled = true;
    };
  }, [draftKey]);

  // Debounced autosave.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!draftKey || !restored) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (state.doc.items.length === 0) AsyncStorage.removeItem(draftKey).catch(() => {});
      else AsyncStorage.setItem(draftKey, JSON.stringify(state.doc)).catch(() => {});
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state.doc, draftKey, restored]);

  const commit = useCallback((fn: (items: Item[]) => Item[]) => {
    setState((s) => {
      const items = fn(s.doc.items);
      if (items === s.doc.items) return s;
      return {
        doc: { ...s.doc, items },
        past: [...s.past.slice(-MAX_HISTORY + 1), s.doc.items],
        future: [],
      };
    });
  }, []);

  const add = useCallback((item: Item) => commit((items) => [...items, item]), [commit]);

  const update = useCallback(
    (id: string, patch: Partial<Item>) =>
      commit((items) => items.map((it) => (it.id === id ? ({ ...it, ...patch } as Item) : it))),
    [commit],
  );

  const remove = useCallback((id: string) => commit((items) => items.filter((it) => it.id !== id)), [commit]);

  const bringToFront = useCallback(
    (id: string) =>
      commit((items) => {
        const it = items.find((i) => i.id === id);
        return it ? [...items.filter((i) => i.id !== id), it] : items;
      }),
    [commit],
  );

  const clear = useCallback(() => commit((items) => (items.length ? [] : items)), [commit]);

  const undo = useCallback(() => {
    setState((s) => {
      if (!s.past.length) return s;
      return {
        doc: { ...s.doc, items: s.past[s.past.length - 1] },
        past: s.past.slice(0, -1),
        future: [s.doc.items, ...s.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (!s.future.length) return s;
      return {
        doc: { ...s.doc, items: s.future[0] },
        past: [...s.past, s.doc.items],
        future: s.future.slice(1),
      };
    });
  }, []);

  /** Picking a preset resets any custom colour/border. */
  const setBoard = useCallback((board: BoardId) => setState((s) => ({ ...s, doc: { ...s.doc, board, style: undefined } })), []);
  const setStyle = useCallback(
    (patch: BoardStyle) => setState((s) => ({ ...s, doc: { ...s.doc, style: { ...s.doc.style, ...patch } } })),
    [],
  );
  const setAspect = useCallback((aspect: number) => setState((s) => ({ ...s, doc: { ...s.doc, aspect } })), []);
  const setBackground = useCallback(
    (bgImagePath: string | null, board?: BoardId, aspect?: number) =>
      setState((s) => ({
        ...s,
        doc: { ...s.doc, bgImagePath, board: board ?? s.doc.board, aspect: aspect ?? s.doc.aspect },
      })),
    [],
  );

  const reset = useCallback(
    (doc?: Doc) => {
      setState({ doc: doc ?? newDoc(state.doc.board, state.doc.aspect), past: [], future: [] });
      if (draftKey) AsyncStorage.removeItem(draftKey).catch(() => {});
    },
    [draftKey, state.doc.board, state.doc.aspect],
  );

  return {
    doc: state.doc,
    restored,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    add,
    update,
    remove,
    bringToFront,
    clear,
    undo,
    redo,
    setBoard,
    setStyle,
    setAspect,
    setBackground,
    reset,
  };
}

export type DrawingDocApi = ReturnType<typeof useDrawingDoc>;
