import { Ionicons } from "@expo/vector-icons";
import React, { memo } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Track } from "../api/client";
import { colors } from "../theme";
import { formatTime } from "../utils";
import { Cover } from "./Cover";

export const ROW_HEIGHT = 64;

interface Props {
  track: Track;
  /** Posizione nella lista mostrata (una playlist può ripetere lo stesso brano). */
  index: number;
  active?: boolean;
  liked?: boolean;
  onPress: (t: Track, index: number) => void;
  onLongPress?: (t: Track) => void;
  onToggleLike?: (file: string) => void;
}

export const TrackRow = memo(function TrackRow({
  track,
  index,
  active,
  liked,
  onPress,
  onLongPress,
  onToggleLike,
}: Props) {
  return (
    <Pressable
      onPress={() => onPress(track, index)}
      onLongPress={onLongPress ? () => onLongPress(track) : undefined}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.surface },
      ]}
    >
      <Cover file={track.has_cover ? track.file : undefined} size={48} />
      <View style={styles.text}>
        <Text
          numberOfLines={1}
          style={[styles.title, active && { color: colors.accent }]}
        >
          {track.title}
        </Text>
        <View style={styles.subRow}>
          {track.explicit ? (
            <View style={styles.explicit}>
              <Text style={styles.explicitLabel}>E</Text>
            </View>
          ) : null}
          <Text numberOfLines={1} style={styles.sub}>
            {track.artist}
          </Text>
        </View>
      </View>
      <Text style={styles.time}>{formatTime(track.duration)}</Text>
    </Pressable>
  );
});

export function trackMenu(
  track: Track,
  actions: { enqueue: (t: Track) => void },
) {
  Alert.alert(track.title, track.artist, [
    { text: "Aggiungi alla coda", onPress: () => actions.enqueue(track) },
    { text: "Annulla", style: "cancel" },
  ]);
}

const styles = StyleSheet.create({
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  text: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 15, fontWeight: "600" },
  subRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sub: { color: colors.dim, fontSize: 13, flexShrink: 1 },
  explicit: {
    backgroundColor: colors.raised,
    borderRadius: 3,
    paddingHorizontal: 4,
  },
  explicitLabel: { color: colors.dim, fontSize: 10, fontWeight: "700" },
  time: { color: colors.faint, fontSize: 12, fontVariant: ["tabular-nums"] },
});
