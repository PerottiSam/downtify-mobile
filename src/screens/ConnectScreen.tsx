import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage, fetchServerInfo, normalizeBaseUrl } from '../api/client';
import { Button } from '../components/ui';
import { AuthParams } from '../navigation/types';
import { colors, font, radius } from '../theme';

export default function ConnectScreen({ navigation }: NativeStackScreenProps<AuthParams, 'Connect'>) {
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const check = async () => {
    if (!address.trim()) return;
    setBusy(true);
    setError(undefined);
    const baseUrl = normalizeBaseUrl(address);
    try {
      const info = await fetchServerInfo(baseUrl);
      navigation.navigate('SignIn', { baseUrl, info });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.wrap, { paddingTop: insets.top + 48 }]}>
      <Ionicons name="cloud-download" size={40} color={colors.accent} />
      <Text style={styles.title}>Downtify</Text>
      <Text style={styles.body}>Collegati al tuo server Downtify per ascoltare la libreria e scaricare nuova musica.</Text>

      <View style={{ gap: 12, marginTop: 28 }}>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="192.168.1.20:8000"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={check}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Verifica server" onPress={check} loading={busy} disabled={!address.trim()} />
        <Text style={styles.hint}>
          Usa l'indirizzo con cui apri Downtify dal browser. Se il server è dietro un reverse proxy, scrivi anche https://.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  title: { color: colors.text, ...font.h1, marginTop: 12 },
  body: { color: colors.dim, fontSize: 15, lineHeight: 22, marginTop: 8 },
  input: { backgroundColor: colors.surface, color: colors.text, fontSize: 16, padding: 14, borderRadius: radius.md },
  error: { color: colors.danger, fontSize: 14 },
  hint: { color: colors.faint, fontSize: 13, lineHeight: 19 },
});
