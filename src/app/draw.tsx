import type { SkImage } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComposeHeader, useRecipient } from '@/components/ComposeHeader';
import { IconButton, Row, useToast } from '@/components/ui';
import { DrawingCanvas, type Tool } from '@/drawing/DrawingCanvas';
import { useHandTypeface } from '@/drawing/fonts';
import { BOARDS, BRUSHES, newDoc, randomSeed, resolveBoard, uid, type BoardId, type BoardStyle, type BrushId, type PlacedItem, type StampId } from '@/drawing/model';
import { BRUSH_ICONS, BoardSheet, BrushTray, MAX_SIZE, MIN_SIZE, Palette, SizeBar, StampSheet, TextSheet } from '@/drawing/panels';
import { publishDoc } from '@/drawing/publish';
import { useDrawingDoc } from '@/drawing/useDrawingDoc';
import { getPost } from '@/lib/api';
import { loadSkImage } from '@/lib/media';
import { MAX_PHOTO_ASPECT, MIN_PHOTO_ASPECT, isLocalPhoto, loadLocalSkImage, pickPhoto } from '@/lib/photo';
import { useSpace, useSpaceParam } from '@/lib/session';
import { GUTTER, colors } from '@/lib/theme';
import { goBack } from '@/lib/nav';

export default function DrawScreen() {
  // over: draw on top of a post. photo/w/h: a photo picked on the Photo screen becomes the canvas.
  const params = useLocalSearchParams<{ space?: string; over?: string; photo?: string; w?: string; h?: string }>();
  const { space } = useSpace();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const typeface = useHandTypeface();

  useSpaceParam(params.space);

  const drawOver = params.over ?? null;
  const photoParam = params.photo ?? null;
  // New boards start frameless: they sit in rounded widgets and squares, where a frame looks boxed in.
  const api = useDrawingDoc({ ...newDoc('classic', 1), style: { frame: 'none' } }, drawOver || photoParam ? null : `draft:${space.id}`);
  const { doc } = api;
  const look = resolveBoard(doc);

  const [tool, setTool] = useState<Tool>({ mode: 'draw', brush: 'chalk', color: look.defaultInk, size: 0.018 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'none' | 'board' | 'stamps' | 'text'>('none');
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<SkImage | null>(null);
  const [sending, setSending] = useState(false);
  const [tray, setTray] = useState<Tray>('color');
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  // The last non-eraser brush, so turning the eraser off goes back to it.
  const [lastBrush, setLastBrush] = useState<BrushId>('chalk');

  // "Draw over" someone's board or photo: their image becomes our background.
  useEffect(() => {
    if (!drawOver) return;
    let cancelled = false;
    (async () => {
      const post = await getPost(drawOver);
      if (!post || cancelled) return;
      api.setBackground(post.image_path, (post.board in BOARDS ? post.board : 'clear') as BoardId, post.aspect);
      const img = await loadSkImage(post.image_path);
      if (!cancelled) setBgImage(img);
    })().catch(() => toast("Couldn't load their board"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawOver]);

  // A photo from the Photo screen: it becomes the canvas, at its own shape.
  useEffect(() => {
    if (!photoParam) return;
    const w = Number(params.w) || 1;
    const h = Number(params.h) || 1;
    api.setBackground(photoParam, doc.board, Math.min(MAX_PHOTO_ASPECT, Math.max(MIN_PHOTO_ASPECT, w / h)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoParam]);

  // Decode a local photo background whenever it changes (also after a draft with one is restored).
  const localBg = isLocalPhoto(doc.bgImagePath) ? doc.bgImagePath : null;
  useEffect(() => {
    if (!localBg) return;
    let cancelled = false;
    loadLocalSkImage(localBg)
      .then((img) => !cancelled && setBgImage(img))
      .catch(() => {
        // The file is gone (e.g. the cache was cleared): fall back to a plain board.
        if (!cancelled) api.setBackground(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localBg]);

  const choosePhoto = async () => {
    setSheet('none');
    try {
      const p = await pickPhoto(false);
      if (!p) return;
      setBgImage(null);
      api.setBackground(p.uri, doc.board, p.width / p.height);
    } catch (e) {
      toast("Couldn't open that photo", e instanceof Error ? e.message : undefined);
    }
  };

  const removePhoto = () => {
    setSheet('none');
    setBgImage(null);
    api.setBackground(null, doc.board, 1);
  };

  const env = useMemo(() => ({ typeface, bgImage }), [typeface, bgImage]);
  const selected = doc.items.find((i) => i.id === selectedId && i.t !== 'stroke') as PlacedItem | undefined;

  // Nobody has joined yet: it's saved to the board and they'll see it when they join.
  const recipient = useRecipient().name;
  const empty = doc.items.length === 0;

  const close = () => {
    if ((drawOver || photoParam) && !empty) {
      Alert.alert('Discard drawing?', drawOver ? 'Your doodle on their board will be lost.' : 'Your doodle on this photo will be lost.', [
        { text: 'Keep drawing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: goBack },
      ]);
      return true;
    }
    goBack();
    return true;
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', close);
    return () => sub.remove();
  });

  const send = async () => {
    if (empty) {
      toast('Draw something first');
      return;
    }
    setSending(true);
    setSelectedId(null);
    try {
      // Drawn on a photo from this phone: it's a photo post (their Photo widget), with the doodle on top.
      await publishDoc(space.id, doc, env, localBg ? 'photo' : 'drawing');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setBgImage(null);
      api.reset(doc.bgImagePath ? { ...newDoc('classic', 1), style: { frame: 'none' } } : { ...newDoc(doc.board, doc.aspect), style: doc.style });
      if (recipient) toast(`Sent to ${recipient}`, 'It’s on their home screen now');
      else toast('Saved to your board', 'They’ll see it when they join');
      goBack();
    } catch (e) {
      toast("Couldn't send", e instanceof Error ? e.message : undefined);
    } finally {
      setSending(false);
    }
  };

  const setBoard = (b: BoardId) => {
    // Swap the ink too if the user hasn't picked a custom color.
    if (tool.color === look.defaultInk) setTool((t) => ({ ...t, color: BOARDS[b].defaultInk }));
    api.setBoard(b);
  };

  const setStyle = (patch: BoardStyle) => {
    const next = resolveBoard({ board: doc.board, style: { ...doc.style, ...patch } });
    if (tool.color === look.defaultInk) setTool((t) => ({ ...t, color: next.defaultInk }));
    api.setStyle(patch);
  };

  const pickColor = (color: string) => {
    if (selected) api.update(selected.id, { color });
    setTool((t) => ({ ...t, color, brush: t.brush === 'eraser' ? 'chalk' : t.brush }));
  };

  const center = { x: 0.5, y: 0.5 / doc.aspect };

  const addStamp = (shape: StampId) => {
    const id = uid();
    api.add({ t: 'stamp', id, shape, color: tool.color, ...center, size: 0.22, rot: Math.round(Math.random() * 20 - 10), seed: randomSeed() });
    setSheet('none');
    setTool((t) => ({ ...t, mode: 'move' }));
    setSelectedId(id);
  };

  const finishText = (text: string) => {
    if (editingTextId) api.update(editingTextId, { text });
    else {
      const id = uid();
      api.add({ t: 'text', id, text, color: tool.color, ...center, size: 0.11, rot: 0, seed: randomSeed() });
      setSelectedId(id);
      setTool((t) => ({ ...t, mode: 'move' }));
    }
    setEditingTextId(null);
    setSheet('none');
  };

  const editItem = (id: string) => {
    const it = doc.items.find((i) => i.id === id);
    if (it?.t === 'text') {
      setEditingTextId(id);
      setSheet('text');
    }
  };

  const duplicate = () => {
    if (!selected) return;
    const id = uid();
    api.add({ ...selected, id, x: Math.min(0.95, selected.x + 0.05), y: selected.y + 0.05, seed: randomSeed() });
    setSelectedId(id);
  };

  const clear = () =>
    Alert.alert('Clear the board?', 'You can undo this.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          api.clear();
          setSelectedId(null);
        },
      },
    ]);

  const pickBrush = (brush: BrushId) => {
    const def = BRUSHES.find((b) => b.id === brush)!;
    setTool((t) => ({ ...t, mode: 'draw', brush, size: t.brush === brush ? t.size : def.defaultSize }));
    if (brush !== 'eraser') setLastBrush(brush);
    setSelectedId(null);
  };

  /** Dock buttons toggle their tray; tapping again goes back to colours. */
  const toggleTray = (t: Tray) => setTray((cur) => (cur === t ? 'color' : t));
  const drawing = tool.mode === 'draw';
  const erasing = drawing && tool.brush === 'eraser';

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
      <ComposeHeader onClose={close} onSend={send} title={drawOver ? 'On their board' : undefined} disabled={empty} busy={sending} />

      {/* Clear / undo / redo */}
      <View style={styles.actions}>
        <IconButton icon="delete" label="Clear the board" disabled={empty} onPress={clear} />
        <View style={{ width: 16 }} />
        <IconButton icon="undo" label="Undo" disabled={!api.canUndo} onPress={api.undo} />
        <IconButton icon="redo" label="Redo" disabled={!api.canRedo} onPress={api.redo} />
      </View>

      {/* Canvas: as big as the space allows, at the board's shape */}
      <View style={styles.canvasWrap} onLayout={(e) => setArea(e.nativeEvent.layout)}>
        {api.restored && area ? (
          <DrawingCanvas
            api={api}
            env={env}
            tool={tool}
            width={Math.floor(Math.min(area.width - GUTTER, area.height * doc.aspect))}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEditItem={editItem}
          />
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>

      {/* Tray: colours by default; brushes / size / the selected item's actions on demand */}
      <View style={styles.tray}>
        {selected && tool.mode === 'move' ? (
          <Row gap={8} style={{ paddingHorizontal: 16 }}>
            {selected.t === 'text' ? <IconButton icon="edit" label="Edit text" onPress={() => editItem(selected.id)} /> : null}
            <IconButton icon="remove" label="Smaller" onPress={() => api.update(selected.id, { size: Math.max(0.03, selected.size / 1.2) })} />
            <IconButton icon="add" label="Bigger" onPress={() => api.update(selected.id, { size: Math.min(1.2, selected.size * 1.2) })} />
            <IconButton icon="content_copy" label="Duplicate" onPress={duplicate} />
            <IconButton icon="flip_to_front" label="Bring to front" onPress={() => api.bringToFront(selected.id)} />
            <View style={{ flex: 1 }} />
            <IconButton
              icon="delete"
              label="Delete"
              color={colors.danger}
              onPress={() => {
                api.remove(selected.id);
                setSelectedId(null);
              }}
            />
          </Row>
        ) : tray === 'brush' ? (
          <BrushTray
            brush={lastBrush}
            onBrush={(b) => {
              pickBrush(b);
              setTray('color');
            }}
          />
        ) : tray === 'size' ? (
          <View style={{ paddingHorizontal: 12 }}>
            <SizeBar size={tool.size} color={erasing ? colors.textDim : tool.color} onSize={(size) => setTool((t) => ({ ...t, size }))} />
          </View>
        ) : (
          <Palette color={selected?.color ?? tool.color} onColor={pickColor} disabled={erasing} />
        )}
      </View>

      {/* Dock */}
      <View style={styles.dock}>
        <IconButton
          icon={BRUSH_ICONS[lastBrush]}
          label="Brushes"
          variant={drawing && !erasing ? 'inverse' : 'surface'}
          onPress={() => {
            if (!drawing || erasing) pickBrush(lastBrush);
            toggleTray('brush');
          }}
        />
        <Pressable
          onPress={() => toggleTray('size')}
          accessibilityRole="button"
          accessibilityLabel="Brush size"
          style={({ pressed }) => [styles.dockBtn, tray === 'size' && { backgroundColor: colors.text }, pressed && { opacity: 0.75 }]}
        >
          <View
            style={{
              width: dotSize(tool.size),
              height: dotSize(tool.size),
              borderRadius: 12,
              backgroundColor: tray === 'size' ? colors.bg : erasing ? colors.textDim : tool.color,
            }}
          />
        </Pressable>
        <IconButton icon="ink_eraser" label="Eraser" variant={erasing ? 'inverse' : 'surface'} onPress={() => pickBrush(erasing ? lastBrush : 'eraser')} />
        <IconButton
          icon="text_fields"
          label="Add text"
          onPress={() => {
            setEditingTextId(null);
            setSheet('text');
          }}
        />
        <IconButton icon="add_reaction" label="Stamps" onPress={() => setSheet('stamps')} />
        <IconButton
          icon="pan_tool"
          label="Move text and stamps"
          variant={tool.mode === 'move' ? 'inverse' : 'surface'}
          onPress={() => setTool((t) => ({ ...t, mode: t.mode === 'move' ? 'draw' : 'move' }))}
        />
        <IconButton icon="wallpaper" label="Board" onPress={() => setSheet('board')} />
      </View>

      <BoardSheet
        visible={sheet === 'board'}
        onClose={() => setSheet('none')}
        board={doc.board}
        style={doc.style}
        aspect={doc.aspect}
        onBoard={setBoard}
        onStyle={setStyle}
        onAspect={api.setAspect}
        canClear={!empty}
        hasPhoto={!!localBg}
        onPhoto={choosePhoto}
        onRemovePhoto={removePhoto}
        onClear={() => {
          api.clear();
          setSelectedId(null);
          setSheet('none');
        }}
      />
      <StampSheet visible={sheet === 'stamps'} onClose={() => setSheet('none')} color={tool.color} dark={look.dark} onPick={addStamp} />
      <TextSheet
        visible={sheet === 'text'}
        initial={editingTextId ? ((doc.items.find((i) => i.id === editingTextId) as PlacedItem & { text?: string })?.text ?? '') : ''}
        onClose={() => {
          setEditingTextId(null);
          setSheet('none');
        }}
        onDone={finishText}
      />
    </View>
  );
}

type Tray = 'color' | 'brush' | 'size';

/** Dock dot that grows with the stroke size (log scale, 6–22px). */
function dotSize(size: number) {
  const t = Math.log(size / MIN_SIZE) / Math.log(MAX_SIZE / MIN_SIZE);
  return Math.round(6 + Math.max(0, Math.min(1, t)) * 16);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, height: 56 },
  canvasWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tray: { height: 60, justifyContent: 'center' },
  dock: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4 },
  dockBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
});
