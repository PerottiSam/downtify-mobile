import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../components/ui';
import { useData } from '../store/data';
import { useSession } from '../store/session';
import { colors, font, radius } from '../theme';

export default function MoreScreen() {
  const { user, baseUrl, serverInfo, signOut } = useSession();
  const { tracks, sync, syncing } = useData();

  const confirmSignOut = () =>
    Alert.alert('Esci', 'Questo dispositivo verrà scollegato dal server.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Esci', style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <Screen title="Altro">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View style={styles.card}>
          <Text style={styles.label}>Account</Text>
          <Text style={styles.value}>{user ? user.username : 'Senza account'}</Text>
          {user ? <Text style={styles.sub}>{user.role === 'admin' ? 'Amministratore' : 'Utente'}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Server</Text>
          <Text style={styles.value}>{serverInfo?.name ?? baseUrl}</Text>
          <Text style={styles.sub}>
            {baseUrl}
            {serverInfo ? ` · Downtify ${serverInfo.version}` : ''}
          </Text>
          <Text style={styles.sub}>{tracks.length} brani in libreria</Text>
          <View style={{ marginTop: 12 }}>
            <Button icon="sync" kind="ghost" label="Riscansiona libreria" loading={syncing} onPress={() => sync({ rescan: true })} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Riproduzione</Text>
          <Text style={styles.sub}>I brani vengono riprodotti in streaming dal file originale della libreria.</Text>
        </View>

        <Button icon="log-out-outline" kind="ghost" label="Esci" onPress={confirmSignOut} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, gap: 4 },
  label: { color: colors.dim, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  value: { color: colors.text, ...font.h2 },
  sub: { color: colors.dim, fontSize: 13 },
});
