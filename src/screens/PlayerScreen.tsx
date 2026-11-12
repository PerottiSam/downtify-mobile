import Slider from "@react-native-community/slider";
import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Cover } from "../components/Cover";
import { Button, IconButton } from "../components/ui";
import { useData } from "../store/data";
import { usePlayer, usePlayerProgress } from "../store/player";
import { useApi } from "../store/session";
import { colors, font } from "../theme";
import { LrcLine, formatTime, parseLrc } from "../utils";
import { CirclePlus } from "lucide-react-native";

function LyricsView({ file }: { file: string }) {
  const api = useApi();
  const { position } = usePlayerProgress();
  const [synced, setSynced] = useState<LrcLine[]>([]);
  const [plain, setPlain] = useState("");
  const [loading, setLoading] = useState(true);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const ys = useRef<number[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    ys.current = [];
    api
      .lyrics(file)
      .then((r) => {
        if (!alive) return;
        setSynced(r.synced ? parseLrc(r.synced) : []);
        setPlain(r.plain ?? "");
      })
      .catch(() => {
        if (alive) {
          setSynced([]);
          setPlain("");
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [api, file]);

  const active = useMemo(() => {
    let a = -1;
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].time <= position + 0.25) a = i;
      else break;
    }
    return a;
  }, [synced, position]);

  useEffect(() => {
    if (active >= 0 && ys.current[active] !== undefined) {
      scroller.current?.scrollTo({
        y: Math.max(0, ys.current[active] - 120),
        animated: true,
      });
    }
  }, [active]);

  if (loading) return <Text style={styles.lyricsEmpty}>Carico i testi…</Text>;
  if (!synced.length && !plain)
    return (
      <Text style={styles.lyricsEmpty}>
        Nessun testo disponibile per questo brano.
      </Text>
    );

  return (
    <ScrollView
      ref={scroller}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 24, gap: 14 }}
    >
      {synced.length ? (
        synced.map((l, i) => (
          <Text
            key={i}
            onLayout={(e) => {
              ys.current[i] = e.nativeEvent.layout.y;
            }}
            style={[
              styles.lyric,
              i === active
                ? styles.lyricActive
                : i < active
                  ? styles.lyricPast
                  : null,
            ]}
          >
            {l.text || "♪"}
          </Text>
        ))
      ) : (
        <Text style={styles.lyricPlain}>{plain}</Text>
      )}
    </ScrollView>
  );
}

export default function PlayerScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { likes, toggleLike } = useData();
  const player = usePlayer();
  const { position, duration } = usePlayerProgress();
  const [showLyrics, setShowLyrics] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);

  const t = player.current;

  // Se la coda finisce vuota (es. dopo il logout) si chiude da sola
  useEffect(() => {
    if (!t && nav.canGoBack()) nav.goBack();
  }, [t, nav]);
  if (!t) return null;

  const total = duration || t.duration || 0;
  const shown = dragging ?? position;
  const liked = likes.has(t.file);
  const cover = Math.min(width - 64, 360);

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <View style={styles.top}>
        <IconButton name="chevron-down" onPress={() => nav.goBack()} />
        <Text style={styles.topLabel}>In riproduzione</Text>
        <IconButton
          name={showLyrics ? "musical-notes" : "text"}
          color={showLyrics ? colors.accent : colors.text}
          onPress={() => setShowLyrics((v) => !v)}
        />
      </View>

      <View style={styles.stage}>
        {showLyrics ? (
          <LyricsView file={t.file} />
        ) : (
          <Cover file={t.has_cover ? t.file : undefined} size={cover} />
        )}
      </View>

      <View style={styles.meta}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.title}>
            {t.title}
          </Text>
          <Text numberOfLines={1} style={styles.artist}>
            {t.artist}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => console.log("show add to playlist modal")}
        >
          <CirclePlus color={liked ? colors.accent : colors.text} />
        </TouchableOpacity>
      </View>

      <Slider
        style={{ marginHorizontal: -8 }}
        minimumValue={0}
        maximumValue={Math.max(total, 1)}
        value={shown}
        onValueChange={setDragging}
        onSlidingComplete={(v) => {
          player.seek(v);
          setDragging(null);
        }}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.line}
        thumbTintColor={colors.accent}
      />
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(shown)}</Text>
        <Text style={styles.time}>{formatTime(total)}</Text>
      </View>

      <View style={styles.controls}>
        <IconButton
          name="repeat"
          size={24}
          color={player.repeat === "off" ? colors.faint : colors.accent}
          onPress={player.cycleRepeat}
        />
        <IconButton name="play-skip-back" size={32} onPress={player.prev} />
        <View style={styles.playBtn}>
          <IconButton
            name={player.playing ? "pause" : "play"}
            size={34}
            color={colors.onAccent}
            onPress={player.toggle}
          />
        </View>
        <IconButton name="play-skip-forward" size={32} onPress={player.next} />
        <View style={{ width: 36, alignItems: "center" }}>
          {player.repeat === "one" ? <Text style={styles.one}>1</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topLabel: { color: colors.dim, fontSize: 13, fontWeight: "600" },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  meta: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: colors.text, ...font.h2, fontSize: 22 },
  artist: { color: colors.dim, fontSize: 16, marginTop: 2 },
  times: { flexDirection: "row", justifyContent: "space-between" },
  time: { color: colors.faint, fontSize: 12, fontVariant: ["tabular-nums"] },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  one: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  lyric: {
    color: colors.faint,
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 30,
  },
  lyricActive: { color: colors.text },
  lyricPast: { color: colors.dim },
  lyricPlain: { color: colors.dim, fontSize: 17, lineHeight: 28 },
  lyricsEmpty: { color: colors.dim, fontSize: 15, textAlign: "center" },
});
