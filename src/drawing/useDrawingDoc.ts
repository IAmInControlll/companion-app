import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { moveLayer as reorder, type LayerMove } from './layers';
import { newDoc, type BoardId, type BoardStyle, type Doc, type Item } from './model';

const MAX_HISTORY = 100;

/** What undo/redo restores: the items, plus the photo background and the shape it set. */
type Snapshot = { items: Item[]; bgImagePath?: string | null; aspect: number };
type State = { doc: Doc; past: Snapshot[]; future: Snapshot[] };

const snap = (doc: Doc): Snapshot => ({ items: doc.items, bgImagePath: doc.bgImagePath, aspect: doc.aspect });
const apply = (doc: Doc, s: Snapshot): Doc => ({ ...doc, items: s.items, bgImagePath: s.bgImagePath, aspect: s.aspect });

/**
 * Drawing document with undo/redo. Item changes and the photo background are tracked in
 * history; board colour/border/shape changes apply immediately.
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
        past: [...s.past.slice(-MAX_HISTORY + 1), snap(s.doc)],
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

  const moveLayer = useCallback((id: string, how: LayerMove) => commit((items) => reorder(items, id, how)), [commit]);

  /** A fresh board: no items and no photo background (back to square if a photo had set the shape). Undoable. */
  const clear = useCallback(
    () =>
      setState((s) => {
        const d = s.doc;
        if (!d.items.length && !d.bgImagePath) return s;
        return {
          doc: { ...d, items: [], bgImagePath: null, aspect: d.bgImagePath ? 1 : d.aspect },
          past: [...s.past.slice(-MAX_HISTORY + 1), snap(d)],
          future: [],
        };
      }),
    [],
  );

  const undo = useCallback(() => {
    setState((s) => {
      if (!s.past.length) return s;
      return {
        doc: apply(s.doc, s.past[s.past.length - 1]),
        past: s.past.slice(0, -1),
        future: [snap(s.doc), ...s.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (!s.future.length) return s;
      return {
        doc: apply(s.doc, s.future[0]),
        past: [...s.past, snap(s.doc)],
        future: s.future.slice(1),
      };
    });
  }, []);

  /** Picking a preset resets a custom background colour but keeps the chosen border. */
  const setBoard = useCallback(
    (board: BoardId) =>
      setState((s) => ({ ...s, doc: { ...s.doc, board, style: s.doc.style?.frame ? { frame: s.doc.style.frame } : undefined } })),
    [],
  );
  const setStyle = useCallback(
    (patch: BoardStyle) => setState((s) => ({ ...s, doc: { ...s.doc, style: { ...s.doc.style, ...patch } } })),
    [],
  );
  const setAspect = useCallback((aspect: number) => setState((s) => ({ ...s, doc: { ...s.doc, aspect } })), []);
  /** Undoable, like drawing (unless `history` is false, e.g. loading their board to draw over). */
  const setBackground = useCallback(
    (bgImagePath: string | null, board?: BoardId, aspect?: number, history = true) =>
      setState((s) => ({
        doc: { ...s.doc, bgImagePath, board: board ?? s.doc.board, aspect: aspect ?? s.doc.aspect },
        past: history ? [...s.past.slice(-MAX_HISTORY + 1), snap(s.doc)] : s.past,
        future: history ? [] : s.future,
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
    moveLayer,
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
