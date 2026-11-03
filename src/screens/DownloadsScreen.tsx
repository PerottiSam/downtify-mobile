import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { QueueJob, errorMessage } from '../api/client';
import { Cover } from '../components/Cover';
import { EmptyState, IconButton, Screen } from '../components/ui';
import { useData } from '../store/data';
import { useApi } from '../store/session';
import { colors } from '../theme';
import { songArtist, songTitle } from '../utils';

const ORDER: Record<QueueJob['status'], number> = { downloading: 0, queued: 1, error: 2, done: 3 };

function statusText(j: QueueJob): { text: string; color: string } {
  switch (j.status) {
    case 'downloading':
      return { text: `Download… ${Math.round(j.progress ?? 0)}%`, color: colors.accent };
    case 'queued':
      return { text: j.position ? `In coda · posizione ${j.position}` : 'In coda', color: colors.dim };
    case 'done':
      return { text: 'Completato', color: colors.ok };
    default:
      return { text: j.message || 'Errore', color: colors.danger };
  }
}

export default function DownloadsScreen() {
  const api = useApi();
  const { queue, refreshQueue } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();

  useFocusEffect(
    useCallback(() => {
      refreshQueue();
    }, [refreshQueue]),
  );

  const jobs = useMemo(() => queue.slice().sort((a, b) => ORDER[a.status] - ORDER[b.status]), [queue]);
  const hasDone = jobs.some((j) => j.status === 'done');

  const refresh = async () => {
    setRefreshing(true);
    await refreshQueue();
    setRefreshing(false);
  };

  const clearDone = async () => {
    try {
      setError(undefined);
      await api.clearCompleted();
      refreshQueue();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen title="Download" right={hasDone ? <IconButton name="checkmark-done" onPress={clearDone} /> : undefined}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={jobs}
        keyExtractor={(j, i) => `${j.song?.song_id ?? i}:${i}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        contentContainerStyle={jobs.length ? undefined : { flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="cloud-download-outline" title="Nessun download" body="Cerca un brano e premi il pulsante di download: il server lo scaricherà e lo vedrai comparire in libreria." />}
        renderItem={({ item }) => {
          const st = statusText(item);
          return (
            <View style={styles.row}>
              <Cover uri={item.song?.cover_url} size={48} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text numberOfLines={1} style={styles.title}>{songTitle(item.song ?? {})}</Text>
                <Text numberOfLines={1} style={styles.sub}>{songArtist(item.song ?? {})}</Text>
                <Text numberOfLines={1} style={[styles.status, { color: st.color }]}>{st.text}</Text>
                {item.status === 'downloading' ? (
                  <View style={styles.bar}>
                    <View style={[styles.fill, { width: `${Math.min(100, Math.max(2, item.progress ?? 0))}%` }]} />
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.dim, fontSize: 13 },
  status: { fontSize: 12, fontWeight: '600' },
  bar: { height: 3, backgroundColor: colors.line, borderRadius: 2, overflow: 'hidden', marginTop: 2 },
  fill: { height: 3, backgroundColor: colors.accent },
  error: { color: colors.danger, paddingHorizontal: 16, paddingBottom: 8, fontSize: 13 },
});
