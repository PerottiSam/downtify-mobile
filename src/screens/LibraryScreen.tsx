import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React, { useCallback, useDeferredValue, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Track } from "../api/client";
import { Cover } from "../components/Cover";
import { ROW_HEIGHT, TrackRow, trackMenu } from "../components/TrackRow";
import {
  Button,
  EmptyState,
  IconButton,
  Screen,
  Segmented,
} from "../components/ui";
import { Nav } from "../navigation/types";
import { useData } from "../store/data";
import { usePlayer } from "../store/player";
import { colors, radius } from "../theme";
import { norm, shuffled } from "../utils";
import { SwipeListView } from "react-native-swipe-list-view";

type Tab = "tracks" | "albums" | "artists";

export default function LibraryScreen() {
  const nav = useNavigation<Nav>();
  const anyNav = useNavigation<any>();
  const { tracks, albums, artists, likes, toggleLike, syncing, sync, error } =
    useData();
  const player = usePlayer();
  const { width } = useWindowDimensions();

  const [tab, setTab] = useState<Tab>("tracks");
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);
  const words = useMemo(
    () => norm(deferred).split(" ").filter(Boolean),
    [deferred],
  );

  // Indice di ricerca precalcolato: filtrare migliaia di brani resta fluido
  const trackIndex = useMemo(
    () => tracks.map((t) => norm(`${t.title} ${t.artist} ${t.album}`)),
    [tracks],
  );
  const filteredTracks = useMemo(() => {
    if (!words.length) return tracks;
    return tracks.filter((_, i) =>
      words.every((w) => trackIndex[i].includes(w)),
    );
  }, [tracks, trackIndex, words]);
  const filteredAlbums = useMemo(
    () =>
      words.length
        ? albums.filter((a) =>
            words.every((w) => norm(`${a.title} ${a.artist}`).includes(w)),
          )
        : albums,
    [albums, words],
  );
  const filteredArtists = useMemo(
    () =>
      words.length
        ? artists.filter((a) => words.every((w) => norm(a.name).includes(w)))
        : artists,
    [artists, words],
  );

  const onPress = useCallback(
    (_t: Track, index: number) => player.play(filteredTracks, index),
    [player.play, filteredTracks],
  );
  const onLong = useCallback(
    (t: Track) => trackMenu(t, player),
    [player.enqueue],
  );
  const refreshControl = (
    <RefreshControl
      refreshing={syncing}
      onRefresh={() => sync({ rescan: true })}
      tintColor={colors.accent}
    />
  );

  const colW = (width - 16 * 2 - 12) / 2;

  const empty =
    syncing && !tracks.length ? (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    ) : (
      <EmptyState
        icon="library-outline"
        title={
          error
            ? "Caricamento non riuscito"
            : words.length
              ? "Nessun risultato"
              : "La libreria è vuota"
        }
        body={
          error ??
          (words.length
            ? "Prova con altre parole."
            : "Cerca un brano o incolla un link per scaricarlo sul server.")
        }
        action={
          !words.length ? (
            <Button
              label={error ? "Riprova" : "Cerca musica"}
              onPress={() =>
                error ? sync({ rescan: true }) : anyNav.navigate("Search")
              }
            />
          ) : undefined
        }
      />
    );

  return (
    <Screen
      title="Libreria"
      right={
        <IconButton
          name="shuffle"
          disabled={!filteredTracks.length}
          onPress={() => player.play(shuffled(filteredTracks), 0)}
        />
      }
    >
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.faint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Cerca in libreria"
          placeholderTextColor={colors.faint}
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.searchInput}
        />
        {q ? (
          <Pressable onPress={() => setQ("")} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: "tracks", label: "Brani" },
          { id: "albums", label: "Album" },
          { id: "artists", label: "Artisti" },
        ]}
      />
      <View style={{ height: 8 }} />

      {tab === "tracks" ? (
        <SwipeListView
          data={filteredTracks}
          keyExtractor={(t) => t.file}
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
          getItemLayout={(_, i) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * i,
            index: i,
          })}
          initialNumToRender={16}
          windowSize={9}
          refreshControl={refreshControl}
          ListEmptyComponent={empty}
          contentContainerStyle={
            filteredTracks.length ? undefined : { flexGrow: 1 }
          }
          keyboardShouldPersistTaps="handled"
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
      ) : null}

      {tab === "albums" ? (
        <FlatList
          key="albums"
          data={filteredAlbums}
          keyExtractor={(a) => a.key}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={
            filteredAlbums.length
              ? { gap: 16, paddingBottom: 16 }
              : { flexGrow: 1 }
          }
          renderItem={({ item }) => (
            <Pressable
              style={{ width: colW }}
              onPress={() =>
                nav.navigate("TrackList", {
                  title: item.title,
                  subtitle: item.artist,
                  files: item.files,
                  coverFile: item.coverFile,
                })
              }
            >
              <Cover file={item.coverFile} size={colW} />
              <Text numberOfLines={1} style={styles.tileTitle}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={styles.tileSub}>
                {item.artist}
                {item.year ? ` · ${item.year}` : ""}
              </Text>
            </Pressable>
          )}
          refreshControl={refreshControl}
          ListEmptyComponent={empty}
        />
      ) : null}

      {tab === "artists" ? (
        <FlatList
          key="artists"
          data={filteredArtists}
          keyExtractor={(a) => a.key}
          contentContainerStyle={
            filteredArtists.length ? undefined : { flexGrow: 1 }
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.artistRow,
                pressed && { backgroundColor: colors.surface },
              ]}
              onPress={() =>
                nav.navigate("TrackList", {
                  title: item.name,
                  subtitle: `${item.files.length} brani`,
                  files: item.files,
                  coverFile: item.coverFile,
                })
              }
            >
              <Cover file={item.coverFile} size={48} round />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.tileTitle}>
                  {item.name}
                </Text>
                <Text style={styles.tileSub}>
                  {item.albumCount} album · {item.files.length} brani
                </Text>
              </View>
            </Pressable>
          )}
          refreshControl={refreshControl}
          ListEmptyComponent={empty}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 11,
  },
  tileTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 6,
  },
  tileSub: { color: colors.dim, fontSize: 12, marginTop: 1 },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
