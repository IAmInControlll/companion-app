import type { SkImage } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Row, useToast } from '@/components/ui';
import { DrawingCanvas, type Tool } from '@/drawing/DrawingCanvas';
import { useHandTypeface } from '@/drawing/fonts';
import { BOARDS, BRUSHES, newDoc, randomSeed, resolveBoard, uid, type BoardId, type BoardStyle, type PlacedItem, type StampId } from '@/drawing/model';
import { BoardSheet, BrushBar, Palette, SizeBar, StampSheet, TextSheet } from '@/drawing/panels';
import { publishDoc } from '@/drawing/publish';
import { useDrawingDoc } from '@/drawing/useDrawingDoc';
import { getPost } from '@/lib/api';
import { loadSkImage } from '@/lib/media';
import { useSpace, useSpaceParam } from '@/lib/session';
import { HAND_FONT, colors } from '@/lib/theme';

export default function DrawScreen() {
  const params = useLocalSearchParams<{ space?: string; over?: string }>();
  const { space, others } = useSpace();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const typeface = useHandTypeface();

  useSpaceParam(params.space);

  const drawOver = params.over ?? null;
  const api = useDrawingDoc(newDoc('classic', 1), drawOver ? null : `draft:${space.id}`);
  const { doc } = api;
  const look = resolveBoard(doc);

  const [tool, setTool] = useState<Tool>({ mode: 'draw', brush: 'chalk', color: look.defaultInk, size: 0.018 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'none' | 'board' | 'stamps' | 'text'>('none');
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<SkImage | null>(null);
  const [sending, setSending] = useState(false);

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

  const env = useMemo(() => ({ typeface, bgImage }), [typeface, bgImage]);
  const selected = doc.items.find((i) => i.id === selectedId && i.t !== 'stroke') as PlacedItem | undefined;

  // Size the canvas to fit between the header and toolbars.
  const chrome = 56 + 290 + insets.top + insets.bottom;
  const canvasW = Math.floor(Math.min(win.width - 24, (win.height - chrome) * doc.aspect));

  const recipient = others.length === 1 ? others[0].profile.display_name : space.name;
  const empty = doc.items.length === 0;

  const close = () => {
    if (drawOver && !empty) {
      Alert.alert('Discard drawing?', 'Your doodle on their board will be lost.', [
        { text: 'Keep drawing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
      return true;
    }
    router.back();
    return true;
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', close);
    return () => sub.remove();
  });

  const send = async () => {
    if (empty) {
      toast('Draw something first ✏️');
      return;
    }
    setSending(true);
    setSelectedId(null);
    try {
      await publishDoc(space.id, doc, env, 'drawing');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      api.reset(doc.bgImagePath ? newDoc('classic', doc.aspect) : { ...newDoc(doc.board, doc.aspect), style: doc.style });
      toast(`Sent to ${recipient} ✨`, 'It’s on their home screen now');
      router.back();
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

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
      <Row style={styles.header}>
        <IconButton icon="✕" label="Close" onPress={close} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title} numberOfLines={1}>
            {drawOver ? 'Drawing on their board' : `To ${recipient}`}
          </Text>
        </View>
        <Pressable onPress={send} disabled={sending} style={[styles.send, empty && { opacity: 0.5 }]}>
          {sending ? <ActivityIndicator color="#3A1F2C" /> : <Text style={styles.sendText}>Send ➤</Text>}
        </Pressable>
      </Row>

      <View style={styles.canvasWrap}>
        {api.restored ? (
          <DrawingCanvas
            api={api}
            env={env}
            tool={tool}
            width={canvasW}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEditItem={editItem}
          />
        ) : (
          <ActivityIndicator color={colors.pink} />
        )}
      </View>

      <View style={{ gap: 8 }}>
        <BrushBar
          brush={tool.brush}
          mode={tool.mode}
          onBrush={(brush) => {
            const def = BRUSHES.find((b) => b.id === brush)!;
            setTool((t) => ({ ...t, mode: 'draw', brush, size: t.brush === brush ? t.size : def.defaultSize }));
            setSelectedId(null);
          }}
          onMove={() => setTool((t) => ({ ...t, mode: 'move' }))}
          onText={() => {
            setEditingTextId(null);
            setSheet('text');
          }}
          onStamps={() => setSheet('stamps')}
        />
        <Palette color={selected?.color ?? tool.color} onColor={pickColor} disabled={tool.mode === 'draw' && tool.brush === 'eraser'} />

        {selected && tool.mode === 'move' ? (
          <Row style={styles.bottomRow} gap={6}>
            <Text style={styles.hint}>{selected.t === 'text' ? 'Text' : 'Stamp'}</Text>
            <View style={{ flex: 1 }} />
            {selected.t === 'text' ? <IconButton icon="✏️" label="Edit text" onPress={() => editItem(selected.id)} /> : null}
            <IconButton icon="➖" label="Smaller" onPress={() => api.update(selected.id, { size: Math.max(0.03, selected.size / 1.2) })} />
            <IconButton icon="➕" label="Bigger" onPress={() => api.update(selected.id, { size: Math.min(1.2, selected.size * 1.2) })} />
            <IconButton icon="⧉" label="Duplicate" onPress={duplicate} />
            <IconButton icon="⬆️" label="Bring to front" onPress={() => api.bringToFront(selected.id)} />
            <IconButton
              icon="🗑️"
              label="Delete"
              onPress={() => {
                api.remove(selected.id);
                setSelectedId(null);
              }}
            />
          </Row>
        ) : (
          <Row style={styles.bottomRow} gap={4}>
            {tool.mode === 'draw' ? (
              <SizeBar size={tool.size} color={tool.brush === 'eraser' ? colors.textDim : tool.color} onSize={(size) => setTool((t) => ({ ...t, size }))} />
            ) : (
              <Text style={styles.hint}>Tap a stamp or text to move it. Pinch to resize, twist to rotate. Drag empty space to pan when zoomed.</Text>
            )}
          </Row>
        )}
        <Row style={styles.bottomRow} gap={4}>
          <Text style={styles.hint}>Two fingers: pinch to zoom, drag to pan</Text>
          <View style={{ flex: 1 }} />
          <IconButton icon="↶" label="Undo" disabled={!api.canUndo} onPress={api.undo} />
          <IconButton icon="↷" label="Redo" disabled={!api.canRedo} onPress={api.redo} />
          <IconButton icon="🎨" label="Board" onPress={() => setSheet('board')} />
        </Row>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { height: 56, paddingHorizontal: 12 },
  title: { fontFamily: HAND_FONT, fontSize: 22, color: colors.text },
  send: { backgroundColor: colors.pink, borderRadius: 22, paddingHorizontal: 18, height: 44, justifyContent: 'center', minWidth: 90, alignItems: 'center' },
  sendText: { fontFamily: HAND_FONT, fontSize: 20, color: '#3A1F2C' },
  canvasWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomRow: { paddingHorizontal: 12, minHeight: 48 },
  hint: { color: colors.textDim, fontSize: 13, flexShrink: 1 },
});
