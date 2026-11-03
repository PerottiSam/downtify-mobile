import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, errorMessage } from '../api/client';
import { Button } from '../components/ui';
import { AuthParams } from '../navigation/types';
import { useSession } from '../store/session';
import { colors, font, radius } from '../theme';

export default function SignInScreen({ route, navigation }: NativeStackScreenProps<AuthParams, 'SignIn'>) {
  const { baseUrl, info } = route.params;
  const insets = useSafeAreaInsets();
  const { signIn, pair, continueWithoutAccount } = useSession();

  const passwordOk = info.capabilities?.password_sign_in === true;
  const [mode, setMode] = useState<'password' | 'code'>(passwordOk ? 'password' : 'code');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (mode === 'password') await signIn(baseUrl, username.trim(), password);
      else await pair(baseUrl, code.trim());
      // la navigazione passa da sola all'app quando la sessione è salvata
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError(mode === 'password' ? 'Nome utente o password errati.' : 'Codice non valido, scaduto o già usato.');
      } else if (e instanceof ApiError && e.status === 409) {
        setError('Gli account sono disattivati su questo server: usa un codice di abbinamento.');
        setMode('code');
      } else {
        setError(errorMessage(e));
      }
      setBusy(false);
    }
  };

  const ready = mode === 'password' ? !!username.trim() && !!password : code.trim().length >= 8;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 24 }]} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>‹ Cambia server</Text>
        </Pressable>
        <Text style={styles.title}>{info.name || 'Downtify'}</Text>
        <Text style={styles.body}>
          Versione {info.version} · {baseUrl}
        </Text>

        <View style={{ gap: 12, marginTop: 28 }}>
          {mode === 'password' ? (
            <>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Nome utente"
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                style={styles.input}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.faint}
                secureTextEntry
                textContentType="password"
                onSubmitEditing={submit}
                style={styles.input}
              />
            </>
          ) : (
            <>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="XXXX-XXXX"
                placeholderTextColor={colors.faint}
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={submit}
                style={[styles.input, { letterSpacing: 3, textAlign: 'center', fontSize: 20 }]}
              />
              <Text style={styles.hint}>Sul sito web apri Impostazioni → App → Abbina un telefono: troverai il codice di 8 caratteri.</Text>
            </>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label={mode === 'password' ? 'Accedi' : 'Abbina dispositivo'} onPress={submit} loading={busy} disabled={!ready} />

          {passwordOk ? (
            <Pressable onPress={() => setMode(mode === 'password' ? 'code' : 'password')} style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={styles.link}>{mode === 'password' ? 'Usa un codice di abbinamento' : 'Usa nome utente e password'}</Text>
            </Pressable>
          ) : null}

          {!info.require_sign_in ? (
            <Pressable onPress={() => continueWithoutAccount(baseUrl)} style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={styles.link}>Continua senza account</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, paddingBottom: 40 },
  back: { color: colors.dim, fontSize: 15, marginBottom: 24 },
  title: { color: colors.text, ...font.h1 },
  body: { color: colors.dim, fontSize: 14, marginTop: 6 },
  input: { backgroundColor: colors.surface, color: colors.text, fontSize: 16, padding: 14, borderRadius: radius.md },
  error: { color: colors.danger, fontSize: 14 },
  hint: { color: colors.faint, fontSize: 13, lineHeight: 19 },
  link: { color: colors.accent, fontSize: 14, fontWeight: '600' },
});
