import type { SkImage } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComposeHeader, useRecipient } from '@/components/ComposeHeader';
import { Icon, IconButton, Row, useToast, type IconName } from '@/components/ui';
import { DrawingCanvas, type Tool } from '@/drawing/DrawingCanvas';
import { useHandTypeface } from '@/drawing/fonts';
import { BOARDS, BRUSHES, PHOTO_SHAPES, newDoc, randomSeed, resolveBoard, uid, type BoardId, type BoardStyle, type BrushId, type PhotoShape, type PlacedItem, type StampId } from '@/drawing/model';
import { BRUSH_ICONS, BoardSheet, PhotoSheet, MAX_SIZE, MIN_SIZE, Palette, SizeBar, StampSheet, TextSheet, ToolTray } from '@/drawing/panels';
import { usePhotoImages } from '@/drawing/photos';
import { publishDoc } from '@/drawing/publish';
import { useDrawingDoc } from '@/drawing/useDrawingDoc';
import { getPost } from '@/lib/api';
import { SHOW_STAMPS } from '@/lib/features';
import { loadSkImage } from '@/lib/media';
import { isLocalPhoto, loadLocalSkImage, pickPhoto, rotatePhoto } from '@/lib/photo';
import { useSpace, useSpaceParam } from '@/lib/session';
import { GUTTER, colors, type } from '@/lib/theme';
import { goBack } from '@/lib/nav';

export default function DrawScreen() {
  // over: draw on top of a post.
  const params = useLocalSearchParams<{ space?: string; over?: string }>();
  const { space } = useSpace();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const typeface = useHandTypeface();

  useSpaceParam(params.space);

  const drawOver = params.over ?? null;
  // New boards start frameless: they sit in rounded widgets and squares, where a frame looks boxed in.
  const api = useDrawingDoc({ ...newDoc('classic', 1), style: { frame: 'none' } }, drawOver ? null : `draft:${space.id}`);
  const { doc } = api;
  const look = resolveBoard(doc);

  const [tool, setTool] = useState<Tool>({ brush: 'chalk', color: look.defaultInk, size: 0.018 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'none' | 'board' | 'stamps' | 'text' | 'photo'>('none');
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  // The decoded background, with the path it came from: undo can swap the path back.
  const [decodedBg, setDecodedBg] = useState<{ path: string; img: SkImage | null } | null>(null);
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
      api.setBackground(post.image_path, (post.board in BOARDS ? post.board : 'clear') as BoardId, post.aspect, false);
      const img = await loadSkImage(post.image_path);
      if (!cancelled) setDecodedBg({ path: post.image_path, img });
    })().catch(() => toast("Couldn't load their board"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawOver]);

  // Decode a local photo background whenever it changes (also after a draft with one is restored).
  const localBg = isLocalPhoto(doc.bgImagePath) ? doc.bgImagePath : null;
  useEffect(() => {
    if (!localBg) return;
    let cancelled = false;
    loadLocalSkImage(localBg)
      .then((img) => !cancelled && setDecodedBg({ path: localBg, img }))
      .catch(() => {
        // The file is gone (e.g. the cache was cleared): fall back to a plain board.
        if (!cancelled) api.setBackground(null, undefined, undefined, false);
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
      api.setBackground(p.uri, doc.board, p.width / p.height);
    } catch (e) {
      toast("Couldn't open that photo", e instanceof Error ? e.message : undefined);
    }
  };

  /** Turn the photo board a quarter turn (the board's shape turns with it). */
  const rotateBackground = async () => {
    if (!localBg) return;
    try {
      const p = await rotatePhoto(localBg);
      api.setBackground(p.uri, doc.board, p.width / p.height);
    } catch (e) {
      toast("Couldn't rotate it", e instanceof Error ? e.message : undefined);
    }
  };

  const removePhoto = () => {
    setSheet('none');
    api.setBackground(null, doc.board, 1);
  };

  const center = { x: 0.5, y: 0.5 / doc.aspect };

  const addPicture = async () => {
    setSheet('none');
    try {
      const p = await pickPhoto(false);
      if (!p) return;
      const aspect = p.width / p.height;
      const id = uid();
      // Big enough to see, small enough to leave room to draw: the longer side is 55% of the board.
      const size = aspect >= 1 ? 0.55 : 0.55 * aspect;
      api.add({ t: 'photo', id, path: p.uri, ...center, size, aspect, rot: Math.round(Math.random() * 8 - 4), seed: randomSeed() });
      setSelectedId(id);
      toast('Two fingers to resize and turn it', 'Tap away when you’re done');
    } catch (e) {
      toast("Couldn't open that photo", e instanceof Error ? e.message : undefined);
    }
  };

  const images = usePhotoImages(doc.items);
  const bgImage = decodedBg && decodedBg.path === doc.bgImagePath ? decodedBg.img : null;
  const env = useMemo(() => ({ typeface, bgImage, images }), [typeface, bgImage, images]);
  const selected = doc.items.find((i) => i.id === selectedId && i.t !== 'stroke') as PlacedItem | undefined;

  // Nobody has joined yet: it's saved to the board and they'll see it when they join.
  const recipient = useRecipient().name;
  const empty = doc.items.length === 0;

  const close = () => {
    if (drawOver && !empty) {
      Alert.alert('Discard drawing?', 'Your doodle on their board will be lost.', [
        { text: 'Keep drawing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => goBack() },
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
      // Drawn on a photo from this phone: tagged 'photo' (still a board; it shows on the Chalkboard widget).
      await publishDoc(space.id, doc, env, localBg ? 'photo' : 'drawing');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDecodedBg(null);
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
    if (selected && selected.t !== 'photo') api.update(selected.id, { color });
    // Picking a colour while erasing means you want to draw again, with the last brush.
    if (tool.brush === 'eraser' && !selected) pickBrush(lastBrush);
    setTool((t) => ({ ...t, color }));
  };

  const addStamp = (shape: StampId) => {
    const id = uid();
    api.add({ t: 'stamp', id, shape, color: tool.color, ...center, size: 0.22, rot: Math.round(Math.random() * 20 - 10), seed: randomSeed() });
    setSheet('none');
    setSelectedId(id);
  };

  const finishText = (text: string) => {
    if (editingTextId) api.update(editingTextId, { text });
    else {
      const id = uid();
      api.add({ t: 'text', id, text, color: tool.color, ...center, size: 0.11, rot: 0, seed: randomSeed() });
      setSelectedId(id);
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
    Alert.alert('Clear the board?', 'Everything on it goes. You can undo this.', [
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
    setTool((t) => ({ ...t, brush, size: t.brush === brush ? t.size : def.defaultSize }));
    if (brush !== 'eraser') setLastBrush(brush);
    setSelectedId(null);
  };

  const erasing = tool.brush === 'eraser';
  /** Tool / Colour / Size: let go of any selected picture or text and show that picker. */
  const openTray = (t: Tray) => {
    setSelectedId(null);
    setTray(t);
  };
  // A tapped picture/text is selected: the tray swaps to its actions until you tap away.
  const editingItem = !!selected;
  /** The dock button whose tray is showing (none while a placed item's actions are). */
  const showing = (t: Tray) => !editingItem && tray === t;
  // Pictures have no ink: the colour button then shows (and sets) the pen colour.
  const ink = selected && selected.t !== 'photo' ? selected.color : tool.color;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
      <ComposeHeader onClose={close} onSend={send} title={drawOver ? 'On their board' : undefined} disabled={empty} busy={sending} />

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
          />
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>

      {/* Clear / eraser / undo / redo, right under the board. Scrolls sideways on a narrow phone. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.edits}>
        <EditPill icon="delete" label="Clear board" disabled={empty && !doc.bgImagePath} onPress={clear} />
        {/* Also in the Tool picker; here so it's one tap away. Tapping again goes back to the last brush. */}
        <EditPill icon={BRUSH_ICONS.eraser} label="Eraser" on={erasing} onPress={() => pickBrush(erasing ? lastBrush : 'eraser')} />
        <View style={{ flex: 1 }} />
        <EditPill icon="undo" label="Undo" disabled={!api.canUndo} onPress={api.undo} />
        <EditPill icon="redo" label="Redo" disabled={!api.canRedo} onPress={api.redo} />
      </ScrollView>

      {/* Tray: tools, colours or size, whichever dock button is lit; or the selected item's actions */}
      <View style={styles.tray}>
        {editingItem ? (
          <Row gap={8} style={{ paddingRight: 16 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemActions} style={{ flex: 1 }}>
              {selected.t === 'text' ? <EditPill icon="edit" label="Edit" a11y="Edit text" onPress={() => editItem(selected.id)} /> : null}
              {selected.t === 'photo' ? (
                <>
                  <EditPill
                    leading={<ShapeGlyph shape={selected.shape ?? 'plain'} />}
                    label="Shape"
                    a11y={`Shape: ${selected.shape ?? 'plain'}. Tap for the next one`}
                    onPress={() => {
                      const now = PHOTO_SHAPES.indexOf(selected.shape ?? 'plain');
                      api.update(selected.id, { shape: PHOTO_SHAPES[(now + 1) % PHOTO_SHAPES.length] });
                    }}
                  />
                  <EditPill
                    leading={<View style={[styles.glyph, { borderWidth: 2.5 }]} />}
                    label="Border"
                    a11y="White border"
                    on={!!selected.border}
                    onPress={() => api.update(selected.id, { border: !selected.border })}
                  />
                </>
              ) : null}
              <EditPill icon="content_copy" label="Copy" a11y="Duplicate" onPress={duplicate} />
              <EditPill icon="arrow_upward" label="Forward" a11y="Bring forward a layer" onPress={() => api.moveLayer(selected.id, 'forward')} />
              <EditPill icon="arrow_downward" label="Back" a11y="Send back a layer" onPress={() => api.moveLayer(selected.id, 'backward')} />
              <EditPill icon="flip_to_front" label="To front" a11y="Bring to the front" onPress={() => api.moveLayer(selected.id, 'front')} />
              <EditPill icon="flip_to_back" label="To back" a11y="Send to the back" onPress={() => api.moveLayer(selected.id, 'back')} />
            </ScrollView>
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
        ) : tray === 'tool' ? (
          <ToolTray brush={tool.brush} onBrush={pickBrush} />
        ) : tray === 'size' ? (
          <View style={{ paddingHorizontal: 12 }}>
            <SizeBar size={tool.size} color={erasing ? colors.textDim : tool.color} onSize={(size) => setTool((t) => ({ ...t, size }))} />
          </View>
        ) : (
          <Palette color={ink} onColor={pickColor} disabled={erasing} />
        )}
      </View>

      {/* Dock: every button labelled, so Tool / Colour / Size read as separate choices */}
      <View style={styles.dock}>
        <Docked label="Tool" on={showing('tool')}>
          <IconButton
            icon={BRUSH_ICONS[tool.brush]}
            label="Tool"
            variant={showing('tool') ? 'inverse' : 'surface'}
            onPress={() => {
              // Back to the brush you were drawing with (the Eraser button is for erasing).
              if (erasing) pickBrush(lastBrush);
              openTray('tool');
            }}
          />
        </Docked>
        <Docked label="Colour" on={showing('color')}>
          <Pressable
            onPress={() => openTray('color')}
            accessibilityRole="button"
            accessibilityLabel="Colour"
            accessibilityState={{ selected: showing('color') }}
            style={({ pressed }) => [styles.dockBtn, showing('color') && { backgroundColor: colors.text }, pressed && { opacity: 0.75 }]}
          >
            <View
              style={[
                styles.swatch,
                { backgroundColor: ink },
                showing('color') && { borderColor: '#00000040' },
                erasing && !selected && { opacity: 0.35 },
              ]}
            />
          </Pressable>
        </Docked>
        <Docked label="Size" on={showing('size')}>
          <Pressable
            onPress={() => openTray('size')}
            accessibilityRole="button"
            accessibilityLabel="Size"
            accessibilityState={{ selected: showing('size') }}
            style={({ pressed }) => [styles.dockBtn, showing('size') && { backgroundColor: colors.text }, pressed && { opacity: 0.75 }]}
          >
            <View
              style={{
                width: dotSize(tool.size),
                height: dotSize(tool.size),
                borderRadius: 12,
                backgroundColor: showing('size') ? colors.bg : colors.textDim,
              }}
            />
          </Pressable>
        </Docked>
        <Docked label="Text">
          <IconButton
            icon="text_fields"
            label="Add text"
            onPress={() => {
              setEditingTextId(null);
              setSheet('text');
            }}
          />
        </Docked>
        <Docked label="Photo">
          <IconButton icon="add_photo_alternate" label="Photo" onPress={() => setSheet('photo')} />
        </Docked>
        {SHOW_STAMPS ? (
          <Docked label="Stamps">
            <IconButton icon="add_reaction" label="Stamps" onPress={() => setSheet('stamps')} />
          </Docked>
        ) : null}
        <Docked label="Board">
          <IconButton icon="wallpaper" label="Board" onPress={() => setSheet('board')} />
        </Docked>
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
        canClear={!empty || !!doc.bgImagePath}
        hasPhoto={!!localBg}
        onPhoto={choosePhoto}
        onRotatePhoto={rotateBackground}
        onRemovePhoto={removePhoto}
        onClear={() => {
          api.clear();
          setSelectedId(null);
          setSheet('none');
        }}
      />
      <PhotoSheet visible={sheet === 'photo'} onClose={() => setSheet('none')} onAdd={addPicture} onBoard={choosePhoto} />
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

type Tray = 'tool' | 'color' | 'size';

/** Little preview of a picture's current shape, for the Shape button. */
function ShapeGlyph({ shape }: { shape: PhotoShape }) {
  if (shape === 'heart') return <Icon name="favorite" size={18} />;
  return <View style={[styles.glyph, { borderRadius: shape === 'circle' ? 9 : shape === 'rounded' ? 5 : 0 }]} />;
}

/** Small labelled button: clear / undo / redo, and the selected item's actions. `on` marks the current choice. */
function EditPill({
  icon,
  leading,
  label,
  a11y,
  disabled,
  on,
  onPress,
}: {
  icon?: IconName;
  /** Drawn instead of an icon (e.g. a shape preview). */
  leading?: ReactNode;
  label: string;
  a11y?: string;
  disabled?: boolean;
  on?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ disabled: !!disabled, ...(on !== undefined ? { selected: on } : {}) }}
      style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && { backgroundColor: colors.line }, disabled && { opacity: 0.35 }]}
    >
      {leading ?? (icon ? <Icon name={icon} size={18} /> : null)}
      <Text style={styles.pillLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A dock button with its name underneath; `on` lights the name with the button. */
function Docked({ label, on, children }: { label: string; on?: boolean; children: ReactNode }) {
  return (
    <View style={styles.dockItem}>
      {children}
      <Text style={[styles.dockLabel, on && { color: colors.text }]} numberOfLines={1} accessible={false}>
        {label}
      </Text>
    </View>
  );
}

/** Dock dot that grows with the stroke size (log scale, 6–22px). */
function dotSize(size: number) {
  const t = Math.log(size / MIN_SIZE) / Math.log(MAX_SIZE / MIN_SIZE);
  return Math.round(6 + Math.max(0, Math.min(1, t)) * 16);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  edits: { flexGrow: 1, alignItems: 'center', gap: 6, paddingHorizontal: GUTTER / 2, paddingVertical: 8 },
  // Never squeezed: on a narrow screen the row scrolls instead of wrapping labels ("To front" → "To").
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.surfaceHi, flexShrink: 0 },
  pillLabel: { ...type.label, fontSize: 14, flexShrink: 0 },
  pillOn: { backgroundColor: colors.accentSoft, borderWidth: 1.5, borderColor: colors.accent },
  glyph: { width: 17, height: 17, borderWidth: 2, borderColor: colors.text },
  itemActions: { gap: 8, paddingHorizontal: 16, alignItems: 'center' },
  canvasWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tray: { height: 60, justifyContent: 'center' },
  dock: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 4 },
  dockItem: { flex: 1, alignItems: 'center', gap: 4 },
  dockLabel: { ...type.micro, fontSize: 11 },
  dockBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#FFFFFF33' },
});
