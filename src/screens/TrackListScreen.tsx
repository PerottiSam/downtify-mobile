import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Track } from '../api/client';
import { Cover } from '../components/Cover';
import { ROW_HEIGHT, TrackRow, trackMenu } from '../components/TrackRow';
import { Button } from '../components/ui';
import { RootParams } from '../navigation/types';
import { useData } from '../store/data';
import { usePlayer } from '../store/player';
import { colors, font } from '../theme';
import { formatTime, shuffled } from '../utils';

export default function TrackListScreen({ route }: NativeStackScreenProps<RootParams, 'TrackList'>) {
  const { title, subtitle, trackIds, coverTrackId } = route.params;
  const { byId, likes, toggleLike } = useData();
  const player = usePlayer();
  const { width } = useWindowDimensions();

  const list = useMemo(() => trackIds.map((id) => byId.get(id)).filter((t): t is Track => !!t), [trackIds, byId]);
  const total = useMemo(() => list.reduce((n, t) => n + (t.duration || 0), 0), [list]);

  const onPress = useCallback((t: Track) => player.play(list, list.indexOf(t)), [player.play, list]);
  const onLong = useCallback((t: Track) => trackMenu(t, player), [player.playNext, player.enqueue]);

  const cover = Math.min(width - 96, 220);

  return (
    <FlatList
      data={list}
      keyExtractor={(t) => t.id}
      getItemLayout={(_, i) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * i, index: i })}
      ListHeaderComponent={
        <View style={styles.head}>
          <Cover trackId={coverTrackId ?? list[0]?.id} size={cover} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>
            {subtitle ? `${subtitle} · ` : ''}
            {list.length} brani · {formatTime(total)}
          </Text>
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button icon="play" label="Riproduci" disabled={!list.length} onPress={() => player.play(list, 0)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button icon="shuffle" kind="ghost" label="Casuale" disabled={!list.length} onPress={() => player.play(shuffled(list), 0)} />
            </View>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <TrackRow
          track={item}
          active={player.current?.id === item.id}
          liked={likes.has(item.id)}
          onPress={onPress}
          onLongPress={onLong}
          onToggleLike={toggleLike}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, gap: 6 },
  title: { color: colors.text, ...font.h2, fontSize: 24, textAlign: 'center', marginTop: 12 },
  sub: { color: colors.dim, fontSize: 13, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 12 },
});
