import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../components/ui';
import { useData } from '../store/data';
import { QUALITIES, QualityId, usePlayer } from '../store/player';
import { useSession } from '../store/session';
import { colors, font, radius } from '../theme';

export default function MoreScreen() {
  const { user, baseUrl, serverInfo, signOut } = useSession();
  const { tracks, sync, syncing } = useData();
  const player = usePlayer();

  const transcoding = serverInfo?.capabilities?.transcoding?.available;
  const qualityIds = (Object.keys(QUALITIES) as QualityId[]).filter((q) => q === 'original' || transcoding);

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
            <Button icon="sync" kind="ghost" label="Risincronizza libreria" loading={syncing} onPress={() => sync({ full: true, refresh: true })} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Qualità dello streaming</Text>
          {qualityIds.map((q) => {
            const on = player.quality === q;
            return (
              <Pressable key={q} onPress={() => player.setQuality(q)} style={styles.option}>
                <View style={[styles.radio, on && { borderColor: colors.accent }]}>{on ? <View style={styles.dot} /> : null}</View>
                <Text style={styles.optionLabel}>{QUALITIES[q].label}</Text>
              </Pressable>
            );
          })}
          {!transcoding ? <Text style={styles.sub}>Il server non ha ffmpeg: la conversione non è disponibile.</Text> : null}
          <Text style={styles.sub}>Vale dal prossimo brano.</Text>
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
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  optionLabel: { color: colors.text, fontSize: 15 },
});
