import * as Clipboard from 'expo-clipboard';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { createSpace, joinSpace } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, type } from '@/lib/theme';
import type { Space, SpaceKind } from '@/lib/types';
import { ADD_WIDGET_HINT, pinWidget } from '@/widgets/refresh';

import { BoardStage } from './BoardStage';
import { ChalkTitle } from './ChalkTitle';
import { Button, Header, Icon, IconButton, Input, Row, Screen, useToast, type IconName } from './ui';

type StepId = 'kind' | 'name' | 'join' | 'invite' | 'widget';

/**
 * Create or join a space, step by step. In onboarding it ends with "invite them" and "add the
 * widget"; the session isn't refreshed until the end, because a space appearing in the session
 * swaps onboarding for Home straight away.
 */
export function SpaceFlow({ mode, onCancel, onFinish }: { mode: 'onboarding' | 'add'; onCancel?: () => void; onFinish?: () => void }) {
  const { profile, refresh, setActiveSpace, signOut, setOnboardingOpen } = useSession();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState<StepId>('kind');
  const [kind, setKind] = useState<SpaceKind>('couple');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [space, setSpace] = useState<Space | null>(null);

  const go = (s: StepId) => {
    setError(null);
    setStep(s);
  };

  const finish = async (id: string) => {
    setActiveSpace(id);
    await refresh().catch(() => {});
    setOnboardingOpen(false);
    onFinish?.();
  };

  // In onboarding, hold the screen for the invite / widget steps. Raised *before* the request:
  // the live "member joined" update can arrive before the RPC returns and would swap in Home.
  const hold = (on: boolean) => mode === 'onboarding' && setOnboardingOpen(on);

  // Android back walks back through the steps.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'name' || step === 'join') {
        setError(null);
        setStep('kind');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step]);

  const create = async () => {
    setBusy(true);
    setError(null);
    hold(true);
    try {
      const s = await createSpace(name.trim(), kind);
      setSpace(s);
      setStep('invite');
    } catch (e) {
      hold(false);
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    hold(true);
    try {
      const s = await joinSpace(code);
      if (mode === 'onboarding') {
        setSpace(s);
        setStep('widget');
      } else await finish(s.id);
    } catch (e) {
      hold(false);
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const person = kind === 'couple' ? 'your person' : 'your people';

  if (step === 'kind') {
    return (
      <Screen style={{ flexGrow: 1 }}>
        {mode === 'add' ? <Header title="New space" onBack={onCancel} /> : null}
        {mode === 'onboarding' ? (
          <View style={{ alignItems: 'center', marginTop: 32, marginBottom: 8 }}>
            <ChalkTitle text={`Hi ${profile?.display_name ?? 'there'}!`} />
          </View>
        ) : null}
        <Text style={[type.title, mode === 'onboarding' && { textAlign: 'center' }]}>Who’s it for?</Text>
        <Choice
          icon="favorite"
          title="My partner"
          subtitle="Just the two of you"
          onPress={() => {
            setKind('couple');
            go('name');
          }}
        />
        <Choice
          icon="group"
          title="Friends or family"
          subtitle="Up to 12 people on one board"
          onPress={() => {
            setKind('group');
            go('name');
          }}
        />
        <Button variant="ghost" icon="key" title="I have an invite code" onPress={() => go('join')} />
        <View style={{ flex: 1 }} />
        {mode === 'onboarding' ? <Button variant="ghost" title="Sign out" onPress={signOut} /> : null}
      </Screen>
    );
  }

  if (step === 'name') {
    return (
      <StepScreen title="Name your space" onBack={() => go('kind')} error={error}>
        <Input
          placeholder={kind === 'couple' ? 'e.g. Us, or your names' : 'e.g. The besties'}
          value={name}
          onChangeText={setName}
          maxLength={40}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => name.trim() && create()}
        />
        <Text style={type.caption}>Only you and {person} will see this.</Text>
        <Button title="Create" loading={busy} disabled={!name.trim()} onPress={create} />
      </StepScreen>
    );
  }

  if (step === 'join') {
    return (
      <StepScreen title="Enter their code" onBack={() => go('kind')} error={error}>
        <Input
          placeholder="ABC123"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          autoFocus
          style={styles.codeInput}
          onSubmitEditing={() => code.length === 6 && join()}
        />
        <Text style={type.caption}>It’s on their Home screen, under the board.</Text>
        <Button title="Join" loading={busy} disabled={code.length < 6} onPress={join} />
      </StepScreen>
    );
  }

  if (step === 'invite' && space) {
    const share = () => {
      Share.share({ message: `Join me on Chalkmates: open the app, tap “I have a code” and enter ${space.invite_code}` }).catch(() => {});
    };
    return (
      <StepScreen title={`Invite ${person}`} error={null}>
        <Text style={[type.body, { color: colors.textDim }]}>They install Chalkmates, tap “I have a code” and enter:</Text>
        <Row style={styles.codeBox}>
          <Text selectable style={styles.code}>
            {space.invite_code}
          </Text>
          <IconButton
            icon="content_copy"
            label="Copy code"
            onPress={async () => {
              await Clipboard.setStringAsync(space.invite_code);
              toast('Code copied');
            }}
          />
        </Row>
        <Button icon="share" title="Share invite" onPress={share} />
        <Button variant="ghost" title={mode === 'onboarding' ? 'Next' : 'Done'} onPress={() => (mode === 'onboarding' ? go('widget') : finish(space.id))} />
      </StepScreen>
    );
  }

  if (step === 'widget' && space) {
    const add = async () => {
      if (!(await pinWidget('Chalkboard'))) toast('Add it from your home screen', ADD_WIDGET_HINT);
      await finish(space.id);
    };
    return (
      <StepScreen title="Put them on your home screen" error={null}>
        <Text style={[type.body, { color: colors.textDim }]}>The Chalkboard widget shows whatever they draw, the moment they send it.</Text>
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <BoardStage size={Math.min(width * 0.6, 260)} post={null} url={null} empty={['hi you', 'miss you already']} label="Widget preview" />
        </View>
        <Button icon="widgets" title="Add the widget" onPress={add} />
        <Button variant="ghost" title="Maybe later" onPress={() => finish(space.id)} />
      </StepScreen>
    );
  }

  return null;
}

function StepScreen({ title, onBack, error, children }: { title: string; onBack?: () => void; error: string | null; children: ReactNode }) {
  return (
    <Screen>
      {onBack ? <Header title="" onBack={onBack} /> : <View style={{ height: 24 }} />}
      <Text style={[type.title, { fontSize: 28, lineHeight: 34 }]}>{title}</Text>
      {children}
      {error ? <Text style={[type.body, { color: colors.danger }]}>{error}</Text> : null}
    </Screen>
  );
}

function Choice({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.choice, pressed && { backgroundColor: colors.surfaceHi }]}>
      <View style={styles.choiceIcon}>
        <Icon name={icon} filled size={26} color={colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.headline}>{title}</Text>
        <Text style={type.caption}>{subtitle}</Text>
      </View>
      <Icon name="chevron_right" color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface },
  choiceIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  codeInput: { fontFamily: fonts.heavy, fontSize: 30, letterSpacing: 8, textAlign: 'center', paddingVertical: 16 },
  codeBox: { justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.lg, paddingLeft: 20, paddingRight: 10, paddingVertical: 10 },
  code: { fontFamily: fonts.heavy, fontSize: 32, letterSpacing: 6, color: colors.text },
});
