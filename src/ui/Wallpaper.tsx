import React from 'react';
import {Image, StyleSheet, View} from 'react-native';
import {useThemeStore} from '../theme';
import tile from '../assets/wallpaper.png';

/** Chat background: a quiet, tinted, repeating pattern behind the messages. */
export default function Wallpaper() {
  const t = useThemeStore(s => s.theme);
  const source = typeof tile === 'string' ? {uri: tile} : tile;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, {backgroundColor: t.chatBg}]}>
      <Image
        source={source}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, {width: undefined, height: undefined, tintColor: t.wallpaperTint, opacity: t.wallpaperOpacity}]}
      />
    </View>
  );
}
