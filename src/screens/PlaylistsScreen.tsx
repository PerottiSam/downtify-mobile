import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Playlist } from '../api/client';
import { Cover } from '../components/Cover';
import { EmptyState, Screen } from '../components/ui';
import { Nav } from '../navigation/types';
import { useData } from '../store/data';
import { colors, font } from '../theme';

const displayName = (p: Playlist) => (p.liked ? 'Brani preferiti' : p.name);

export default function PlaylistsScreen() {
  const nav = useNavigation<Nav>();
  const { playlists, byFile, refreshPlaylists } = useData();
  const [refreshing, setRefreshing] = useState(false);

  const sections = useMemo(() => {
    const mine = playlists.filter((p) => p.mine !== false);
    const shared = playlists.filter((p) => p.mine === false);
    return [
      { title: 'Le tue playlist', data: mine },
      { title: 'Condivise con te', data: shared },
    ].filter((s) => s.data.length > 0);
  }, [playlists]);

  const refresh = async () => {
    setRefreshing(true);
    await refreshPlaylists();
    setRefreshing(false);
  };

  return (
    <Screen title="Playlist">
      <SectionList
        sections={sections}
        keyExtractor={(p) => `${p.owner ?? ''}:${p.name}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        contentContainerStyle={sections.length ? undefined : { flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="albums-outline" title="Nessuna playlist" body="Le playlist scaricate o create sul server compariranno qui." />}
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        renderItem={({ item }) => {
          // i file non più presenti in libreria si saltano
          const files = item.files.filter((f) => byFile.has(f));
          const firstWithCover = files.find((f) => byFile.get(f)?.has_cover);
          const owner = item.owner && item.mine === false ? ` · di ${item.owner}` : '';
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
              onPress={() =>
                nav.navigate('TrackList', {
                  title: displayName(item),
                  subtitle: item.owner && item.mine === false ? `di ${item.owner}` : undefined,
                  files,
                  coverFile: firstWithCover,
                })
              }
            >
              <Cover playlistCover={item.cover || undefined} file={item.cover ? undefined : firstWithCover} size={56} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.name}>{displayName(item)}</Text>
                <Text style={styles.sub}>{files.length} brani{owner}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.text, ...font.h2, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sub: { color: colors.dim, fontSize: 13, marginTop: 2 },
});
