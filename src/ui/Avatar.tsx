import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Font, useThemeStore} from '../theme';
import {Icon} from './Icon';

export const COLORS = ['#F2555A', '#F5A524', '#17C964', '#0EA5E9', '#7C5CFC', '#EC4899', '#14B8A6', '#6366F1', '#F97316'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function avatarColor(id: string): string {
  return COLORS[hash(id) % COLORS.length];
}

// Text-safe shades of COLORS (same order): light >= 4.5:1 on white, dark >= 4.5:1 on #1C1D24.
export const SENDER_TEXT_COLORS: {light: string; dark: string}[] = [
  {light: '#D6393F', dark: '#FF8A8E'},
  {light: '#B45309', dark: '#FBBF24'},
  {light: '#15803D', dark: '#4ADE80'},
  {light: '#0369A1', dark: '#38BDF8'},
  {light: '#6D4AE8', dark: '#A78BFA'},
  {light: '#BE185D', dark: '#F472B6'},
  {light: '#0F766E', dark: '#2DD4BF'},
  {light: '#4F46E5', dark: '#A5B4FC'},
  {light: '#C2410C', dark: '#FB923C'},
];

export function senderTextColor(id: string, isDark: boolean): string {
  const c = SENDER_TEXT_COLORS[hash(id) % SENDER_TEXT_COLORS.length];
  return isDark ? c.dark : c.light;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = Array.from(parts[0])[0] ?? '';
  const second = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] ?? '' : '';
  return (first + second).toUpperCase();
}

export default function Avatar({
  id,
  name,
  size = 48,
  online = false,
  group = false,
}: {
  id: string;
  name: string;
  size?: number;
  online?: boolean;
  group?: boolean;
}) {
  const {theme: t} = useThemeStore();
  const dot = Math.max(10, size * 0.26);
  return (
    <View style={{width: size, height: size}}>
      <View style={[styles.circle, {width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(id)}]}>
        {group ? (
          <Icon name="people" size={size * 0.46} color="#FFFFFF" />
        ) : (
          <Text style={[styles.text, {fontSize: size * 0.38}]}>{initials(name)}</Text>
        )}
      </View>
      {online && (
        <View
          accessible
          accessibilityLabel="Online"
          style={[
            styles.dot,
            {width: dot, height: dot, borderRadius: dot / 2, backgroundColor: t.online, borderColor: t.bg},
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {alignItems: 'center', justifyContent: 'center'},
  text: {color: '#FFFFFF', fontFamily: Font.bold, letterSpacing: 0.3},
  dot: {position: 'absolute', right: 0, bottom: 0, borderWidth: 2.5},
});
