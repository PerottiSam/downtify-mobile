import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useMemo } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Track } from "../api/client";
import { Cover } from "../components/Cover";
import { ROW_HEIGHT, TrackRow, trackMenu } from "../components/TrackRow";
import { Button } from "../components/ui";
import { TabStackParams } from "../navigation/types";
import { useData } from "../store/data";
import { usePlayer } from "../store/player";
import { colors, font } from "../theme";
import { formatTime, shuffled } from "../utils";
import { SwipeListView } from "react-native-swipe-list-view";

export default function TrackListScreen({
  route,
}: NativeStackScreenProps<TabStackParams, "TrackList">) {
  const { title, subtitle, files, coverFile } = route.params;
  const { byFile, likes, toggleLike } = useData();
  const player = usePlayer();
  const { width } = useWindowDimensions();

  // una playlist può ripetere un brano: la lista segue l'ordine e le ripetizioni dei file
  const list = useMemo(
    () => files.map((f) => byFile.get(f)).filter((t): t is Track => !!t),
    [files, byFile],
  );
  const total = useMemo(
    () => list.reduce((n, t) => n + (t.duration || 0), 0),
    [list],
  );

  const onPress = useCallback(
    (_t: Track, index: number) => player.play(list, index),
    [player.play, list],
  );
  const onLong = useCallback(
    (t: Track) => trackMenu(t, player),
    [player.enqueue],
  );

  const cover = Math.min(width - 96, 220);
  const headCover = coverFile ?? list.find((t) => t.has_cover)?.file;

  return (
    <SwipeListView
      data={list}
      keyExtractor={(t, i) => `${t.file}:${i}`}
      getItemLayout={(_, i) => ({
        length: ROW_HEIGHT,
        offset: ROW_HEIGHT * i,
        index: i,
      })}
      ListHeaderComponent={
        <View style={styles.head}>
          <Cover file={headCover} size={cover} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>
            {subtitle ? `${subtitle} · ` : ""}
            {list.length} brani · {formatTime(total)}
          </Text>
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button
                icon="play"
                label="Riproduci"
                disabled={!list.length}
                onPress={() => player.play(list, 0)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                icon="shuffle"
                kind="ghost"
                label="Casuale"
                disabled={!list.length}
                onPress={() => player.play(shuffled(list), 0)}
              />
            </View>
          </View>
        </View>
      }
      renderItem={({ item, index }) => (
        <TrackRow
          track={item}
          index={index}
          active={player.current?.file === item.file}
          liked={likes.has(item.file)}
          onPress={onPress}
          onLongPress={onLong}
          onToggleLike={toggleLike}
        />
      )}
      renderHiddenItem={(item, index) => (
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text>Left</Text>
          <Text>Right</Text>
        </View>
      )}
      leftOpenValue={75}
      rightOpenValue={-75}
    />
  );
}

const styles = StyleSheet.create({
  head: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 6,
  },
  title: {
    color: colors.text,
    ...font.h2,
    fontSize: 24,
    textAlign: "center",
    marginTop: 12,
  },
  sub: { color: colors.dim, fontSize: 13, textAlign: "center" },
  actions: {
    flexDirection: "row",
    gap: 10,
    alignSelf: "stretch",
    marginTop: 12,
  },
});
