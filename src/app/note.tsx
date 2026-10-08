import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View, useWindowDimensions } from 'react-native';

import { Button, Chip, H1, Input, Row, Screen, useToast } from '@/components/ui';
import { DocView } from '@/drawing/DrawingCanvas';
import { fitText } from '@/drawing/fitText';
import { useHandTypeface } from '@/drawing/fonts';
import { BOARD_IDS, BOARDS, type BoardId, type Doc } from '@/drawing/model';
import { Palette } from '@/drawing/panels';
import { publishDoc } from '@/drawing/publish';
import { useSpace, useSpaceParam } from '@/lib/session';

/** Quick typed chalk message: the fastest way to put words on their home screen. */
export default function NoteScreen() {
  const { space: spaceParam } = useLocalSearchParams<{ space?: string }>();
  useSpaceParam(spaceParam);
  const { space, others } = useSpace();
  const toast = useToast();
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
      aspect: 1,
      items: [{ t: 'text', id: 'note', text: fitted.text, color, x: 0.5, y: 0.5, size: fitted.size, rot: -1.5, seed: 7 }],
    };
  }, [text, board, color, typeface]);

  const env = useMemo(() => ({ typeface }), [typeface]);

  const send = async () => {
    setSending(true);
    try {
      await publishDoc(space.id, doc, env, 'note', text.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Note sent 📝');
      router.back();
    } catch (e) {
      toast("Couldn't send", e instanceof Error ? e.message : undefined);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
      <Screen>
        <H1>Note to {others.length === 1 ? others[0].profile.display_name : space.name}</H1>
        <View style={{ alignItems: 'center', opacity: text ? 1 : 0.6 }}>
          <DocView doc={doc} env={env} width={Math.min(width - 32, 340)} />
        </View>
        <Input placeholder="Write a little something…" value={text} onChangeText={setText} multiline maxLength={180} autoFocus />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {BOARD_IDS.map((id) => (
            <Chip
              key={id}
              label={BOARDS[id].name}
              active={board === id}
              onPress={() => {
                if (color === BOARDS[board].defaultInk) setColor(BOARDS[id].defaultInk);
                setBoard(id);
              }}
            />
          ))}
        </ScrollView>
        <View style={{ marginHorizontal: -12 }}>
          <Palette color={color} onColor={setColor} />
        </View>
        <Row>
          <Button variant="ghost" title="Cancel" onPress={() => router.back()} style={{ flex: 1 }} />
          <Button title="Send note" loading={sending} disabled={!text.trim()} onPress={send} style={{ flex: 1 }} />
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}
