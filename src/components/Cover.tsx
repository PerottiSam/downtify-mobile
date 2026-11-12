import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSession } from '../store/session';
import { colors, radius } from '../theme';

interface Props {
  /** File di un brano in libreria (`GET /cover?file=`, richiede l'header Authorization). */
  file?: string;
  /** Copertina di una playlist: il campo `cover` di `GET /playlists`. */
  playlistCover?: string;
  /** URL esterno pubblico (risultati di ricerca, classifiche). */
  uri?: string;
  size: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Cover({ file, playlistCover, uri, size, round, style }: Props) {
  const { api } = useSession();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [file, playlistCover, uri]);

  const dim = { width: size, height: size, borderRadius: round ? size / 2 : radius.sm };

  let source: { uri: string; headers?: Record<string, string> } | null = null;
  if (uri) source = { uri };
  else if (api && playlistCover) source = { uri: api.playlistCoverUrl(playlistCover), headers: api.authHeaders() };
  else if (api && file) {
    const px = size <= 150 ? 150 : size <= 300 ? 300 : 600;
    source = { uri: api.coverUrl(file, px as 150 | 300 | 600), headers: api.authHeaders() };
  }

  if (!source || failed) {
    return (
      <View style={[styles.placeholder, dim, style]}>
        <Ionicons name="musical-notes" size={Math.round(size * 0.4)} color={colors.faint} />
      </View>
    );
  }
  return <Image source={source} style={[dim, { backgroundColor: colors.raised }, style as any]} onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
});
