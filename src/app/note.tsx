import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComposeHeader, useRecipient } from '@/components/ComposeHeader';
import { Chip, Input, useToast } from '@/components/ui';
import { DocView } from '@/drawing/DrawingCanvas';
import { fitText } from '@/drawing/fitText';
import { useHandTypeface } from '@/drawing/fonts';
import { BOARD_IDS, BOARDS, type BoardId, type Doc } from '@/drawing/model';
import { Palette } from '@/drawing/panels';
import { publishDoc } from '@/drawing/publish';
import { useSpace, useSpaceParam } from '@/lib/session';
import { GUTTER, colors, radius } from '@/lib/theme';
import { goBack } from '@/lib/nav';

/** Quick typed chalk message: the fastest way to put words on their home screen. */
export default function NoteScreen() {
  const { space: spaceParam } = useLocalSearchParams<{ space?: string }>();
  useSpaceParam(spaceParam);
  const { space } = useSpace();
  const recipient = useRecipient().name;
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const typeface = useHandTypeface();
  const { width } = useWindowDimensions();
  const [text, setText] = useState('');
  const [board, setBoard] = useState<BoardId>('classic');
  const [color, setColor] = useState<string>(BOARDS.classic.defaultInk);
  const [sending, setSending] = useState(false);

  const doc: Doc = useMemo(() => {
    const fitted = fitText(text || 'Thinking of you…', 1, typeface);
    return {
      v: 1,
      board,
      style: { frame: 'none' },
      aspect: 1,
      items: [{ t: 'text', id: 'note', text: fitted.text, color, x: 0.5, y: 0.5, size: fitted.size, rot: -1.5, seed: 7 }],
    };
  }, [text, board, color, typeface]);

  const env = useMemo(() => ({ typeface }), [typeface]);
  const empty = !text.trim();

  const send = async () => {
    if (empty) {
      toast('Write something first');
      return;
    }
    setSending(true);
    try {
      await publishDoc(space.id, doc, env, 'note', text.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast(recipient ? `Sent to ${recipient}` : 'Saved to your board');
      goBack();
    } catch (e) {
      toast("Couldn't send", e instanceof Error ? e.message : undefined);
    } finally {
      setSending(false);
    }
  };

  const size = Math.min(width - GUTTER * 2, 360);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ComposeHeader onClose={() => goBack()} onSend={send} disabled={empty} busy={sending} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View collapsable={false} style={[styles.preview, { width: size, height: size, opacity: text ? 1 : 0.55 }]}>
          <DocView doc={doc} env={env} width={size} />
        </View>
        <Input placeholder="Write a little something" value={text} onChangeText={setText} multiline maxLength={180} autoFocus />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER, flexGrow: 0 }} contentContainerStyle={styles.chips}>
          {BOARD_IDS.map((id) => (
            <Chip
              key={id}
              label={BOARDS[id].name}
              active={board === id}
              onPress={() => {
                // Swap the ink too, unless they picked their own colour.
                if (color === BOARDS[board].defaultInk) setColor(BOARDS[id].defaultInk);
                setBoard(id);
              }}
            />
          ))}
        </ScrollView>
        <View style={{ marginHorizontal: -GUTTER }}>
          <Palette color={color} onColor={setColor} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: GUTTER, gap: 16, paddingTop: 8 },
  preview: { alignSelf: 'center', borderRadius: radius.board, overflow: 'hidden' },
  chips: { paddingHorizontal: GUTTER, gap: 8 },
});
