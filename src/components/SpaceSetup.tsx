import { useState } from 'react';
import { Text, View } from 'react-native';

import { createSpace, joinSpace } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import type { SpaceKind } from '@/lib/types';

import { Body, Button, Card, Chip, H2, Input, Row } from './ui';

/** Create a couple/group space, or join one with an invite code. */
export function SpaceSetup({ onDone }: { onDone?: () => void }) {
  const { refresh, setActiveSpace } = useSession();
  const [tab, setTab] = useState<'join' | 'create'>('create');
  const [kind, setKind] = useState<SpaceKind>('couple');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ id: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const space = await fn();
      setActiveSpace(space.id);
      await refresh();
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <Row>
        <Chip label="✨ Start a space" active={tab === 'create'} onPress={() => setTab('create')} />
        <Chip label="🔑 I have a code" active={tab === 'join'} onPress={() => setTab('join')} />
      </Row>

      {tab === 'create' ? (
        <Card>
          <H2>Who’s it for?</H2>
          <Row>
            <Chip label="💞 My partner" active={kind === 'couple'} onPress={() => setKind('couple')} />
            <Chip label="👯 Friends / family" active={kind === 'group'} onPress={() => setKind('group')} />
          </Row>
          <Body dim>{kind === 'couple' ? 'Just the two of you.' : 'Up to 12 people sharing one board.'}</Body>
          <Input
            placeholder={kind === 'couple' ? 'Name it (e.g. "Us 💕")' : 'Group name (e.g. "Besties")'}
            value={name}
            onChangeText={setName}
            maxLength={40}
          />
          <Button
            title="Create & get invite code"
            loading={busy}
            disabled={!name.trim()}
            onPress={() => run(() => createSpace(name.trim(), kind))}
          />
        </Card>
      ) : (
        <Card>
          <H2>Enter their invite code</H2>
          <Input
            placeholder="ABC123"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            maxLength={6}
            style={{ fontSize: 26, letterSpacing: 6, textAlign: 'center' }}
          />
          <Button title="Join" loading={busy} disabled={code.trim().length < 6} onPress={() => run(() => joinSpace(code))} />
        </Card>
      )}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}
