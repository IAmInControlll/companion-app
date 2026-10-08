import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Text, View, useWindowDimensions } from 'react-native';

import { ChalkTitle } from '@/components/ChalkTitle';
import { Body, Button, IconButton, Input, PasswordInput, Screen } from '@/components/ui';
import { DocView } from '@/drawing/DrawingCanvas';
import { useHandTypeface } from '@/drawing/fonts';
import type { Doc } from '@/drawing/model';
import { supabase } from '@/lib/supabase';
import { HAND_FONT, colors } from '@/lib/theme';

type Mode = 'welcome' | 'sign-in' | 'sign-up' | 'reset';

/** A little board on the welcome screen, drawn with the real engine. */
const HERO: Doc = {
  v: 1,
  board: 'classic',
  aspect: 1.6,
  items: [
    { t: 'text', id: 't', text: 'thinking of you', color: '#F4F1E8', x: 0.5, y: 0.27, size: 0.1, rot: -3, seed: 4 },
    { t: 'stamp', id: 'h', shape: 'heart', color: '#F7A8C4', x: 0.5, y: 0.45, size: 0.14, rot: 6, seed: 2 },
    { t: 'stamp', id: 's1', shape: 'sparkle', color: '#FFE08A', x: 0.2, y: 0.42, size: 0.07, rot: 0, seed: 5 },
    { t: 'stamp', id: 's2', shape: 'sparkle', color: '#9CC9F5', x: 0.8, y: 0.16, size: 0.06, rot: 12, seed: 6 },
    { t: 'stamp', id: 's3', shape: 'star', color: '#FFE08A', x: 0.84, y: 0.47, size: 0.06, rot: -10, seed: 7 },
  ],
};

export default function SignIn() {
  const { width } = useWindowDimensions();
  const typeface = useHandTypeface();
  const env = useMemo(() => ({ typeface }), [typeface]);
  const [mode, setMode] = useState<Mode>('welcome');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Password reset: an emailed code (no deep link needed), then a new password.
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');

  const go = (m: Mode) => {
    setError(null);
    setCodeSent(false);
    setCode('');
    setMode(m);
  };

  const sendResetCode = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Enter the email you signed up with.');
      return;
    }
    setBusy(true);
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (e) setError(e.message);
    else setCodeSent(true);
  };

  const resetPassword = async () => {
    setError(null);
    if (!code.trim() || password.length < 6) {
      setError('Enter the code from the email and a new password of at least 6 characters.');
      return;
    }
    setBusy(true);
    // Verifying signs the user in; set the new password straight after.
    const verified = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    const updated = verified.error ? null : await supabase.auth.updateUser({ password });
    setBusy(false);
    const e = verified.error ?? updated?.error;
    if (e) setError(e.message);
  };

  // Android back returns to the welcome screen instead of closing the app.
  useEffect(() => {
    if (mode === 'welcome') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      go('welcome');
      return true;
    });
    return () => sub.remove();
  }, [mode]);

  const submit = async () => {
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError('Enter your email and a password of at least 6 characters.');
      return;
    }
    if (mode === 'sign-up' && !name.trim()) {
      setError('What should your people call you?');
      return;
    }
    setBusy(true);
    const res =
      mode === 'sign-up'
        ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() } } })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (res.error) setError(res.error.message);
    else if (mode === 'sign-up' && !res.data.session) {
      setError('Check your email to confirm your account, then log in.');
      setMode('sign-in');
    }
  };

  if (mode === 'welcome') {
    return (
      <Screen style={{ justifyContent: 'center', flexGrow: 1 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <ChalkTitle text="Chalkmates" />
          <Body dim style={{ textAlign: 'center' }}>
            Draw on each other’s home screens.{'\n'}Free, forever.
          </Body>
          <View style={{ marginVertical: 24 }}>
            <DocView doc={HERO} env={env} width={Math.min(width - 48, 360)} />
          </View>
        </View>
        <Button title="Log in" onPress={() => go('sign-in')} />
        <Button variant="ghost" title="Register" onPress={() => go('sign-up')} />
      </Screen>
    );
  }

  if (mode === 'reset') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <Screen style={{ flexGrow: 1 }}>
          <IconButton icon="←" label="Back" onPress={() => go('sign-in')} />
          <View style={{ gap: 4, marginVertical: 12 }}>
            <Text style={{ fontFamily: HAND_FONT, fontSize: 38, color: colors.text }}>Reset password</Text>
            <Body dim>{codeSent ? `We emailed a code to ${email.trim()}.` : 'We’ll email you a code to set a new one.'}</Body>
          </View>
          <Input
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!codeSent}
            autoFocus={!codeSent}
          />
          {codeSent ? (
            <>
              <Input placeholder="Code from the email" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={10} autoFocus />
              <PasswordInput placeholder="New password" value={password} onChangeText={setPassword} autoComplete="new-password" onSubmitEditing={resetPassword} />
            </>
          ) : null}
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <Button title={codeSent ? 'Set new password' : 'Email me a code'} onPress={codeSent ? resetPassword : sendResetCode} loading={busy} />
          {codeSent ? <Button variant="ghost" title="Send a new code" onPress={sendResetCode} /> : null}
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  const signUp = mode === 'sign-up';
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
      <Screen style={{ flexGrow: 1 }}>
        <IconButton icon="←" label="Back" onPress={() => go('welcome')} />
        <View style={{ gap: 4, marginVertical: 12 }}>
          <Text style={{ fontFamily: HAND_FONT, fontSize: 38, color: colors.text }}>{signUp ? 'Make an account' : 'Welcome back'}</Text>
          <Body dim>{signUp ? 'Takes ten seconds. No card, no catch.' : 'Log in to see what they drew.'}</Body>
        </View>

        {signUp ? <Input placeholder="Your name" value={name} onChangeText={setName} maxLength={40} autoFocus /> : null}
        <Input
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          autoFocus={!signUp}
        />
        <PasswordInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          autoComplete={signUp ? 'new-password' : 'current-password'}
          onSubmitEditing={submit}
        />
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

        <Button title={signUp ? 'Register' : 'Log in'} onPress={submit} loading={busy} />
        <Button
          variant="ghost"
          title={signUp ? 'I already have an account' : 'New here? Register'}
          onPress={() => go(signUp ? 'sign-in' : 'sign-up')}
        />
        {signUp ? null : <Button variant="ghost" title="Forgot password?" onPress={() => go('reset')} />}
        <Text onPress={() => router.push('/privacy')} style={{ color: colors.textDim, textAlign: 'center', textDecorationLine: 'underline' }}>
          Privacy policy
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
