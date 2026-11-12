import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePlayer, usePlayerProgress } from '../store/player';
import { colors } from '../theme';
import { Cover } from './Cover';
import { IconButton } from './ui';

export function MiniPlayer() {
  const nav = useNavigation<any>();
  const { current, playing, buffering, toggle, next } = usePlayer();
  const { position, duration } = usePlayerProgress();
  if (!current) return null;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => nav.navigate('Player')} style={styles.body}>
        <Cover file={current.has_cover ? current.file : undefined} size={40} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.title}>
            {current.title}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {current.artist}
          </Text>
        </View>
        {buffering && !playing ? <ActivityIndicator color={colors.accent} /> : null}
        <IconButton name={playing ? 'pause' : 'play'} onPress={toggle} />
        <IconButton name="play-skip-forward" onPress={next} size={22} />
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  body: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  title: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sub: { color: colors.dim, fontSize: 12 },
  track: { height: 2, backgroundColor: colors.line },
  fill: { height: 2, backgroundColor: colors.accent },
});
