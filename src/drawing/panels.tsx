import { Canvas, Picture, createPicture } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColorPicker, RainbowSwatch, SectionLabel, SwatchButton, useRecentColors } from '@/components/ColorPicker';
import { Slider } from '@/components/Slider';
import { Button, Chip, Icon, Row, Sheet, type IconName } from '@/components/ui';
import { HAND_FONT, colors, radius, type } from '@/lib/theme';

import {
  ASPECTS,
  BOARD_COLORS,
  BOARD_IDS,
  BOARDS,
  BRUSHES,
  FRAMES,
  PALETTE,
  SIZES,
  STAMPS,
  newDoc,
  type BoardId,
  type BoardStyle,
  type BrushId,
  type FrameId,
  type StampId,
} from './model';
import { drawDoc, drawStamp } from './render';

export const MIN_SIZE = 0.003;
export const MAX_SIZE = 0.15;

// ---------------------------------------------------------------------------
// Inline toolbars
// ---------------------------------------------------------------------------

/** Icon for each brush (Material Symbols). */
export const BRUSH_ICONS: Record<BrushId, IconName> = {
  chalk: 'gesture',
  pen: 'stylus_pen',
  neon: 'auto_awesome',
  highlighter: 'stylus_highlighter',
  spray: 'brush',
  rainbow: 'palette',
  eraser: 'ink_eraser',
};

/** Drawing tools for the composer's tray, eraser last. Colour is picked on its own (Palette). */
export function ToolTray({ brush, onBrush }: { brush: BrushId; onBrush: (b: BrushId) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barContent}>
      {BRUSHES.map((b) => (
        <Chip key={b.id} icon={BRUSH_ICONS[b.id]} label={b.label} active={brush === b.id} onPress={() => onBrush(b.id)} />
      ))}
    </ScrollView>
  );
}

/** Preset swatches + any custom colour via the full picker. Recent custom colours are remembered. */
export function Palette({ color, onColor, disabled }: { color: string; onColor: (c: string) => void; disabled?: boolean }) {
  const { recent, addRecent } = useRecentColors();
  const [picking, setPicking] = useState(false);
  const presets = PALETTE.map((c) => c.toUpperCase());
  const extras = recent.filter((c) => !presets.includes(c));
  const is = (c: string) => color.toUpperCase() === c.toUpperCase();
  const customActive = !presets.includes(color.toUpperCase()) && !extras.includes(color.toUpperCase());

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.barContent, disabled && { opacity: 0.3 }]}>
        <Pressable
          disabled={disabled}
          onPress={() => setPicking(true)}
          accessibilityLabel="Custom colour"
          style={[styles.swatchRing, customActive && { borderColor: colors.text }]}
        >
          {customActive ? <View style={[styles.customDot, { backgroundColor: color }]} /> : <RainbowSwatch />}
        </Pressable>
        {extras.map((c) => (
          <SwatchButton key={`r${c}`} color={c} active={is(c)} onPress={() => !disabled && onColor(c)} />
        ))}
        {extras.length ? <View style={styles.divider} /> : null}
        {PALETTE.map((c) => (
          <SwatchButton key={c} color={c} active={is(c)} onPress={() => !disabled && onColor(c)} />
        ))}
      </ScrollView>
      <ColorSheet
        visible={picking}
        initial={color}
        onClose={() => setPicking(false)}
        onDone={(hex) => {
          addRecent(hex);
          onColor(hex);
          setPicking(false);
        }}
      />
    </>
  );
}

/** Six quick presets plus a slider for anything in between. */
export function SizeBar({ size, color, onSize }: { size: number; color: string; onSize: (s: number) => void }) {
  return (
    <Row gap={2} style={{ flex: 1 }}>
      {SIZES.map((s, i) => {
        const d = 5 + i * 3.5;
        const active = Math.abs(s - size) < 1e-4;
        return (
          <Pressable key={s} onPress={() => onSize(s)} style={[styles.sizeBtn, active && { backgroundColor: colors.surfaceHi }]} accessibilityLabel={`Size ${i + 1}`}>
            <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: active ? color : colors.textDim }} />
          </Pressable>
        );
      })}
      <Slider value={size} min={MIN_SIZE} max={MAX_SIZE} log onChange={onSize} color={color} />
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------


export function ColorSheet({ visible, initial, onClose, onDone }: { visible: boolean; initial: string; onClose: () => void; onDone: (hex: string) => void }) {
  const { width } = useWindowDimensions();
  const [hex, setHex] = useState(initial);
  const { recent } = useRecentColors();
  // Every time the sheet opens, start from the colour currently in use.
  const [openCount, setOpenCount] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setHex(initial);
      setOpenCount((n) => n + 1);
    }
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Pick any colour">
      <ColorPicker key={openCount} value={initial} onChange={setHex} width={width - 32} />
      {recent.length ? (
        <>
          <SectionLabel>Recent</SectionLabel>
          <Row gap={2} style={{ flexWrap: 'wrap' }}>
            {recent.map((c) => (
              <SwatchButton key={c} color={c} active={c === hex.toUpperCase()} onPress={() => onDone(c)} />
            ))}
          </Row>
        </>
      ) : null}
      <Row>
        <Button variant="ghost" title="Cancel" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Use colour" onPress={() => onDone(hex)} style={{ flex: 1 }} />
      </Row>
    </Sheet>
  );
}

/** A big, can't-miss choice: accent icon, title and subtitle. */
function PhotoTile({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      style={({ pressed }) => [styles.photoTile, pressed && { backgroundColor: colors.line }]}
    >
      <View style={styles.photoIcon}>
        <Icon name={icon} size={26} color={colors.onAccent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.headline}>{title}</Text>
        <Text style={type.caption}>{subtitle}</Text>
      </View>
      <Icon name="chevron_right" color={colors.textFaint} />
    </Pressable>
  );
}

/** The dock's Photo button: a movable picture, or the whole board. */
export function PhotoSheet({ visible, onClose, onAdd, onBoard }: { visible: boolean; onClose: () => void; onAdd: () => void; onBoard: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Photo">
      <PhotoTile icon="image" title="Add a picture" subtitle="Put a photo anywhere on the board" onPress={onAdd} />
      <PhotoTile icon="wallpaper" title="Use as the board" subtitle="Fill the whole board with a photo" onPress={onBoard} />
    </Sheet>
  );
}

export function BoardSheet({
  visible,
  onClose,
  board,
  style,
  aspect,
  onBoard,
  onStyle,
  onAspect,
  onClear,
  canClear,
  hasPhoto,
  onPhoto,
  onRotatePhoto,
  onRemovePhoto,
}: {
  visible: boolean;
  onClose: () => void;
  board: BoardId;
  style: BoardStyle | undefined;
  aspect: number;
  onBoard: (b: BoardId) => void;
  onStyle: (patch: BoardStyle) => void;
  onAspect: (a: number) => void;
  onClear: () => void;
  canClear: boolean;
  /** The canvas is a photo picked on this phone. */
  hasPhoto?: boolean;
  onPhoto?: () => void;
  onRotatePhoto?: () => void;
  onRemovePhoto?: () => void;
}) {
  const { width } = useWindowDimensions();
  const { recent, addRecent } = useRecentColors();
  const [customOpen, setCustomOpen] = useState(false);
  const base = (style?.base ?? BOARDS[board].base).toUpperCase();
  const frame = style?.frame ?? BOARDS[board].frame;
  const bgChoices = [...new Set([...BOARD_COLORS.map((c) => c.toUpperCase()), ...recent])];

  return (
    <Sheet visible={visible} onClose={onClose} title="Board">
      {onPhoto ? (
        hasPhoto ? (
          <Row gap={10}>
            <Button variant="secondary" icon="add_photo_alternate" title="Change" onPress={onPhoto} style={{ flex: 1 }} />
            <Button variant="secondary" icon="refresh" title="Rotate" onPress={onRotatePhoto} style={{ flex: 1 }} />
            <Button variant="secondary" icon="close" title="Remove" onPress={onRemovePhoto} style={{ flex: 1 }} />
          </Row>
        ) : (
          <PhotoTile icon="add_photo_alternate" title="Draw on a photo" subtitle="Pick one of yours as the board" onPress={onPhoto} />
        )
      ) : null}
      <SectionLabel>Presets</SectionLabel>
      <View style={styles.grid}>
        {BOARD_IDS.map((id) => (
          <Pressable key={id} onPress={() => onBoard(id)} style={[styles.boardTile, board === id && !style?.base && { borderColor: colors.accent }]}>
            <BoardPreview board={id} />
            <Text style={styles.tileLabel}>{BOARDS[id].name}</Text>
          </Pressable>
        ))}
      </View>

      <SectionLabel>Background colour</SectionLabel>
      <Row gap={2} style={{ flexWrap: 'wrap' }}>
        <Pressable onPress={() => setCustomOpen((o) => !o)} style={[styles.swatchRing, customOpen && { borderColor: colors.text }]} accessibilityLabel="Custom background colour">
          <RainbowSwatch />
        </Pressable>
        {bgChoices.map((c) => (
          <SwatchButton key={c} color={c} active={c === base} onPress={() => onStyle({ base: c })} />
        ))}
      </Row>
      {customOpen ? (
        <View style={{ gap: 8 }}>
          <ColorPicker value={base} onChange={(hex) => onStyle({ base: hex })} width={width - 32} />
          <Button
            variant="secondary"
            title="Done"
            onPress={() => {
              addRecent(base);
              setCustomOpen(false);
            }}
          />
        </View>
      ) : null}

      <SectionLabel>Border</SectionLabel>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {FRAMES.map((f) => (
          <FrameChip key={f.id} id={f.id} label={f.label} color={f.color} active={frame === f.id} onPress={() => onStyle({ frame: f.id })} />
        ))}
      </Row>

      <SectionLabel>Shape</SectionLabel>
      <Row>
        {ASPECTS.map((a) => (
          <Chip key={a.id} label={a.label} active={Math.abs(aspect - a.value) < 0.01} onPress={() => onAspect(a.value)} />
        ))}
      </Row>
      <Button variant="danger" title="Clear the board" icon="delete" disabled={!canClear} onPress={onClear} style={{ marginTop: 4 }} />
    </Sheet>
  );
}

function FrameChip({ id, label, color, active, onPress }: { id: FrameId; label: string; color: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.frameChip, active && { borderColor: colors.accent, backgroundColor: colors.surfaceHi }]}>
      <View
        style={{
          width: 22,
          height: 16,
          borderRadius: 3,
          borderWidth: id === 'none' ? 1 : 4,
          borderColor: id === 'none' ? colors.textFaint : color,
          borderStyle: id === 'none' ? 'dashed' : 'solid',
          backgroundColor: '#2F4A3A',
        }}
      />
      <Text style={styles.frameLabel}>{label}</Text>
    </Pressable>
  );
}

function BoardPreview({ board }: { board: BoardId }) {
  const W = 64;
  const picture = useMemo(() => createPicture((c) => drawDoc(c, newDoc(board, 1), W, { typeface: null }), { width: W, height: W }), [board]);
  return (
    <Canvas style={{ width: W, height: W, borderRadius: 10 }}>
      <Picture picture={picture} />
    </Canvas>
  );
}

export function StampSheet({ visible, onClose, color, dark, onPick }: { visible: boolean; onClose: () => void; color: string; dark: boolean; onPick: (s: StampId) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Stamps">
      <View style={styles.grid}>
        {STAMPS.map((s) => (
          <Pressable key={s.id} onPress={() => onPick(s.id)} style={styles.stampTile} accessibilityLabel={s.label}>
            <StampPreview shape={s.id} color={color} dark={dark} />
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

function StampPreview({ shape, color, dark }: { shape: StampId; color: string; dark: boolean }) {
  const W = 56;
  const picture = useMemo(
    () =>
      createPicture(
        (c) => drawStamp(c, { t: 'stamp', id: shape, shape, color, x: 0.5, y: 0.5, size: 0.8, rot: 0, seed: 1 }, W, dark),
        { width: W, height: W },
      ),
    [shape, color, dark],
  );
  return (
    <Canvas style={{ width: W, height: W }}>
      <Picture picture={picture} />
    </Canvas>
  );
}

export function TextSheet({
  visible,
  initial,
  onClose,
  onDone,
}: {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initial);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent onShow={() => setValue(initial)}>
      <KeyboardAvoidingView behavior="padding" style={[styles.textModal, { paddingTop: insets.top + 24 }]}>
        <TextInput
          autoFocus
          multiline
          value={value}
          onChangeText={setValue}
          placeholder="Write something sweet…"
          placeholderTextColor={colors.textFaint}
          maxLength={200}
          style={styles.textInput}
        />
        <Row style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" title="Cancel" onPress={onClose} />
          <Button title="Done" disabled={!value.trim()} onPress={() => onDone(value.trim())} />
        </Row>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  barContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  divider: { width: 1, height: 32, backgroundColor: colors.line, marginHorizontal: 4 },
  swatchRing: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  customDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#FFFFFF' },
  sizeBtn: { width: 30, height: 36, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  photoIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  boardTile: { alignItems: 'center', gap: 4, padding: 4, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  tileLabel: { color: colors.textDim, fontSize: 12 },
  frameChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.line },
  frameLabel: type.label,
  stampTile: { width: 68, height: 68, borderRadius: 16, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  textModal: { flex: 1, backgroundColor: colors.scrim, padding: 20, gap: 12 },
  textInput: { fontFamily: HAND_FONT, fontSize: 34, color: colors.text, textAlign: 'center', minHeight: 120 },
});
