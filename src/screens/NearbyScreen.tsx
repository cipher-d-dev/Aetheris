import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {useNavigation} from '@react-navigation/native';
import {openSettings} from 'react-native-permissions';
import {useThemeStore, Font} from '../theme';
import {useIdentityStore} from '../store/identityStore';
import {MeshRoute, useMeshService} from '../store/meshService';
import {displayName} from '../store/messagesStore';
import {formatShortId} from '../crypto/encoding';

function PulsingRing({color}: {color: string}) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(scale, {toValue: 1.8, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true}),
        Animated.timing(opacity, {toValue: 0, duration: 1400, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);
  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulseRing, {borderColor: color, transform: [{scale}], opacity}]} />
      <View style={[styles.pulseDot, {backgroundColor: color}]} />
    </View>
  );
}

function Stat({value, label}: {value: number; label: string}) {
  const {theme: t} = useThemeStore();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, {color: t.text}]}>{value}</Text>
      <Text style={[styles.statLabel, {color: t.textMuted}]}>{label}</Text>
    </View>
  );
}

function PeerRow({route, onPress}: {route: MeshRoute; onPress: () => void}) {
  const {theme: t} = useThemeStore();
  const direct = route.hops === 1;
  return (
    <TouchableOpacity
      style={[styles.peerRow, {backgroundColor: t.surface, borderColor: t.border}]}
      onPress={onPress}
      activeOpacity={0.7}>
      <View style={[styles.avatar, {backgroundColor: t.accentSoft, borderColor: t.accentBorder}]}>
        <Icon name={direct ? 'radio' : 'share-2'} size={16} color={t.accent} />
      </View>
      <View style={{flex: 1}}>
        <Text style={[styles.peerName, {color: t.text}]} numberOfLines={1}>
          {displayName(route.id, route.alias)}
        </Text>
        <Text style={[styles.peerSub, {color: t.textMuted}]} numberOfLines={1}>
          {direct
            ? `${formatShortId(route.id)} · in range`
            : `${formatShortId(route.id)} · ${route.hops} hops via ${displayName(route.nextHop)}`}
        </Text>
      </View>
      <View style={[styles.hopBadge, {backgroundColor: direct ? t.successBg : t.surfaceAlt}]}>
        <Text style={[styles.hopText, {color: direct ? t.successText : t.textSub}]}>
          {direct ? 'Direct' : `${route.hops} hops`}
        </Text>
      </View>
      <Icon name="message-circle" size={16} color={t.textMuted} style={{marginLeft: 8}} />
    </TouchableOpacity>
  );
}

export default function NearbyScreen() {
  const {theme: t} = useThemeStore();
  const identity = useIdentityStore(s => s.identity);
  const navigation = useNavigation<any>();
  const {status, error, permission, bluetoothOn, routes, nearbyCount, carrying, bootstrap} =
    useMeshService();

  const direct = routes.filter(r => r.hops === 1);
  const viaMesh = routes.filter(r => r.hops > 1);

  const openChat = (id: string) =>
    navigation.navigate('Messages', {screen: 'Chat', params: {conversationId: id}, initial: false});

  const retry = () => identity && bootstrap(identity.publicKeyBase58);

  let banner: {icon: string; text: string; action?: {label: string; onPress: () => void}} | null =
    null;
  if (permission === 'blocked') {
    banner = {
      icon: 'lock',
      text: 'Aetheris needs Nearby devices / Location permission to find other phones.',
      action: {label: 'Open settings', onPress: () => openSettings()},
    };
  } else if (permission === 'denied') {
    banner = {
      icon: 'lock',
      text: 'Permission is needed to discover nearby phones.',
      action: {label: 'Allow', onPress: retry},
    };
  } else if (!bluetoothOn) {
    banner = {
      icon: 'bluetooth',
      text: 'Bluetooth is off. Turn it on so nearby phones can find you.',
      action: {label: 'Retry', onPress: retry},
    };
  } else if (status === 'error') {
    banner = {icon: 'alert-triangle', text: error ?? 'The radio failed to start.', action: {label: 'Retry', onPress: retry}};
  }

  const running = status === 'running';

  return (
    <ScrollView style={{flex: 1, backgroundColor: t.bg}} contentContainerStyle={styles.content}>
      <View style={styles.headerTop}>
        <View>
          <Text style={[styles.title, {color: t.text}]}>Mesh</Text>
          <Text style={[styles.subtitle, {color: t.textMuted}]}>
            {running ? 'Listening for nearby phones' : status === 'starting' ? 'Starting radio…' : 'Radio is off'}
          </Text>
        </View>
        {running && <PulsingRing color={t.accent} />}
      </View>

      {banner && (
        <View style={[styles.banner, {backgroundColor: t.errorBg, borderColor: t.errorBorder}]}>
          <Icon name={banner.icon} size={16} color={t.errorText} />
          <Text style={[styles.bannerText, {color: t.errorText}]}>{banner.text}</Text>
          {banner.action && (
            <TouchableOpacity onPress={banner.action.onPress}>
              <Text style={[styles.bannerAction, {color: t.errorText}]}>{banner.action.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={[styles.stats, {backgroundColor: t.surface, borderColor: t.border}]}>
        <Stat value={nearbyCount} label="nearby" />
        <Stat value={direct.length} label="linked" />
        <Stat value={routes.length} label="reachable" />
        <Stat value={carrying} label="carrying" />
      </View>

      <Text style={[styles.section, {color: t.textMuted}]}>IN RANGE</Text>
      {direct.length === 0 ? (
        <Text style={[styles.empty, {color: t.textMuted}]}>
          No one in range yet. Phones running Aetheris within ~30–100 m connect automatically.
        </Text>
      ) : (
        direct.map(r => <PeerRow key={r.id} route={r} onPress={() => openChat(r.id)} />)
      )}

      <Text style={[styles.section, {color: t.textMuted}]}>THROUGH THE MESH</Text>
      {viaMesh.length === 0 ? (
        <Text style={[styles.empty, {color: t.textMuted}]}>
          People your neighbours can reach show up here, with the shortest path to them.
        </Text>
      ) : (
        viaMesh.map(r => <PeerRow key={r.id} route={r} onPress={() => openChat(r.id)} />)
      )}

      {carrying > 0 && (
        <Text style={[styles.footnote, {color: t.textMuted}]}>
          This phone is holding {carrying} encrypted message{carrying === 1 ? '' : 's'} and will pass
          {carrying === 1 ? ' it' : ' them'} on when a route appears.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {paddingHorizontal: 20, paddingTop: 56, paddingBottom: 90},
  headerTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20},
  title: {fontSize: 28, fontFamily: Font.extraBold, letterSpacing: -0.5},
  subtitle: {fontSize: 13, fontFamily: Font.regular, marginTop: 2},
  pulseWrap: {width: 24, height: 24, alignItems: 'center', justifyContent: 'center'},
  pulseRing: {position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 1.5},
  pulseDot: {width: 8, height: 8, borderRadius: 4},
  banner: {flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16},
  bannerText: {flex: 1, fontSize: 13, fontFamily: Font.regular, lineHeight: 18},
  bannerAction: {fontSize: 13, fontFamily: Font.bold},
  stats: {flexDirection: 'row', borderWidth: 1, borderRadius: 16, paddingVertical: 14, marginBottom: 8},
  stat: {flex: 1, alignItems: 'center'},
  statValue: {fontSize: 20, fontFamily: Font.bold},
  statLabel: {fontSize: 11, fontFamily: Font.medium, marginTop: 2},
  section: {fontSize: 10, fontFamily: Font.bold, letterSpacing: 2, marginTop: 20, marginBottom: 8},
  empty: {fontSize: 13, fontFamily: Font.regular, lineHeight: 19},
  peerRow: {flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8},
  avatar: {width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1},
  peerName: {fontSize: 14, fontFamily: Font.semiBold},
  peerSub: {fontSize: 11, fontFamily: Font.regular, marginTop: 2},
  hopBadge: {borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3},
  hopText: {fontSize: 11, fontFamily: Font.semiBold},
  footnote: {fontSize: 12, fontFamily: Font.regular, marginTop: 20, lineHeight: 18},
});
