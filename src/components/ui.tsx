import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Screen({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>{right}</View>
      </View>
      {children}
    </View>
  );
}

export function IconButton({
  name,
  onPress,
  color = colors.text,
  size = 24,
  disabled,
}: {
  name: IconName;
  onPress?: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }, disabled && { opacity: 0.3 }]}
    >
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
}) {
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: colors.accent } : { backgroundColor: colors.raised },
        (pressed || loading) && { opacity: 0.7 },
        disabled && { opacity: 0.4 },
      ]}
    >
      {icon && <Ionicons name={icon} size={18} color={primary ? colors.onAccent : colors.text} />}
      <Text style={[styles.buttonLabel, { color: primary ? colors.onAccent : colors.text }]}>{loading ? 'Attendi…' : label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} style={[styles.segment, on && { backgroundColor: colors.raised }]}>
            <Text style={[styles.segmentLabel, { color: on ? colors.text : colors.dim }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={44} color={colors.faint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  title: { color: colors.text, ...font.h1 },
  iconBtn: { padding: 6 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: radius.md },
  buttonLabel: { fontSize: 15, fontWeight: '700' },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 3, marginHorizontal: 16 },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md - 3 },
  segmentLabel: { fontSize: 14, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { color: colors.dim, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
});
