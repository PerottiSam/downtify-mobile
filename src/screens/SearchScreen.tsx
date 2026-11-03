import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ResolvedUrl, Song, errorMessage } from '../api/client';
import { Cover } from '../components/Cover';
import { Button, EmptyState, Screen } from '../components/ui';
import { useData } from '../store/data';
import { useApi, useSession } from '../store/session';
import { colors, font, radius } from '../theme';
import { firstArtist, norm, songArtist, songTitle } from '../utils';

const songKey = (s: Song) => s.song_id ?? s.url ?? `${songArtist(s)}|${songTitle(s)}`;
const libKey = (artist: string, title: string) => `${norm(firstArtist(artist))}|${norm(title)}`;

export default function SearchScreen() {
  const api = useApi();
  const { serverInfo } = useSession();
  const { tracks, refreshQueue } = useData();

  const [text, setText] = useState('');
  const [songs, setSongs] = useState<Song[]>([]);
  const [resolved, setResolved] = useState<ResolvedUrl | null>(null);
  const [chart, setChart] = useState<Song[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [requested, setRequested] = useState<Set<string>>(new Set());

  const libraryOnly = !!serverInfo?.library_only;

  // Classifica globale all'apertura (se il server ha Discover)
  useEffect(() => {
    if (libraryOnly) return;
    api.chart(25).then((c) => setChart(c.tracks ?? [])).catch(() => {});
  }, [api, libraryOnly]);

  const owned = useMemo(() => new Set(tracks.map((t) => libKey(t.artists?.[0] ?? t.artist, t.title))), [tracks]);

  const submit = async () => {
    const q = text.trim();
    if (!q) return;
    Keyboard.dismiss();
    setBusy(true);
    setError(undefined);
    setResolved(null);
    setSongs([]);
    try {
      if (/^https?:\/\//i.test(q)) setResolved(await api.resolveUrl(q));
      else setSongs(await api.search(q));
      setSearched(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async (list: Song[], extra: { playlist_url?: string } = {}) => {
    try {
      await api.downloadBatch(list, extra);
      setRequested((prev) => {
        const next = new Set(prev);
        list.forEach((s) => next.add(songKey(s)));
        return next;
      });
      refreshQueue();
    } catch (e) {
      Alert.alert('Download non avviato', errorMessage(e));
    }
  };

  const rows = resolved ? resolved.tracks : searched ? songs : chart;
  const showingChart = !resolved && !searched;

  const header = (
    <View>
      {resolved ? (
        <View style={styles.resolved}>
          <Cover uri={resolved.cover_url} size={72} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={2} style={styles.resolvedTitle}>{resolved.name}</Text>
            {resolved.subtitle ? <Text numberOfLines={1} style={styles.sub}>{resolved.subtitle}</Text> : null}
            <Text style={styles.sub}>{resolved.kind === 'artist' ? 'Artista' : `${resolved.tracks.length} brani`}</Text>
          </View>
        </View>
      ) : null}
      {resolved && resolved.kind !== 'artist' && resolved.tracks.length > 0 ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <Button
            icon="download-outline"
            label={resolved.tracks.length > 1 ? `Scarica tutti (${resolved.tracks.length})` : 'Scarica'}
            onPress={() => download(resolved.tracks, resolved.kind === 'playlist' ? { playlist_url: text.trim() } : {})}
          />
        </View>
      ) : null}
      {showingChart && chart.length > 0 ? <Text style={styles.section}>Classifica globale</Text> : null}
    </View>
  );

  return (
    <Screen title="Cerca">
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.faint} />
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (!v) {
              setSearched(false);
              setResolved(null);
              setError(undefined);
            }
          }}
          placeholder="Brano, artista o link"
          placeholderTextColor={colors.faint}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={submit}
          style={styles.input}
        />
        {busy ? <ActivityIndicator color={colors.accent} /> : null}
      </View>

      {libraryOnly ? (
        <EmptyState icon="lock-closed-outline" title="Modalità solo libreria" body="Il server non consente ricerche esterne né download. Usa la scheda Libreria." />
      ) : error ? (
        <EmptyState icon="alert-circle-outline" title="Ricerca non riuscita" body={error} action={<Button label="Riprova" onPress={submit} />} />
      ) : resolved?.kind === 'artist' ? (
        <>
          {header}
          <EmptyState icon="person-outline" title="Link di un artista" body="Incolla il link di un brano, un album o una playlist per scaricarli." />
        </>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s, i) => `${songKey(s)}:${i}`}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          contentContainerStyle={rows.length ? undefined : { flexGrow: 1 }}
          ListEmptyComponent={
            busy ? null : searched ? (
              <EmptyState icon="search-outline" title="Nessun risultato" body="Prova con un altro titolo o incolla direttamente il link." />
            ) : (
              <EmptyState icon="musical-notes-outline" title="Trova nuova musica" body="Scrivi un titolo o incolla un link Spotify, YouTube Music, Deezer o SoundCloud." />
            )
          }
          renderItem={({ item }) => {
            const title = songTitle(item);
            const artist = songArtist(item);
            const inLibrary = owned.has(libKey(artist, title));
            const asked = requested.has(songKey(item));
            return (
              <View style={styles.row}>
                <Cover uri={item.cover_url} size={48} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={styles.rowTitle}>{title}</Text>
                  <Text numberOfLines={1} style={styles.sub}>{artist}{item.album_name ? ` · ${item.album_name}` : ''}</Text>
                </View>
                {inLibrary ? (
                  <Ionicons name="checkmark-circle" size={24} color={colors.ok} />
                ) : asked ? (
                  <Ionicons name="time-outline" size={24} color={colors.accent} />
                ) : (
                  <Pressable onPress={() => download([item])} hitSlop={10} style={styles.dl}>
                    <Ionicons name="download-outline" size={22} color={colors.text} />
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12 },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 11 },
  section: { color: colors.text, ...font.h2, paddingHorizontal: 16, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.dim, fontSize: 13 },
  dl: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  resolved: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 16 },
  resolvedTitle: { color: colors.text, ...font.h2 },
});
