import React, {useEffect, useMemo, useRef} from 'react';
import {View, Text, StyleSheet, SectionList, Pressable, Animated, Easing, AccessibilityRole, AccessibilityState} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Font, Type, useThemeStore} from '../theme';
import {useMeshService} from '../store/meshService';
import {useIdentityStore} from '../store/identityStore';
import {displayName, useMessagesStore} from '../store/messagesStore';
import {dbListPeers} from '../db/database';
import {formatShortId} from '../crypto/encoding';
import Avatar from '../ui/Avatar';
import {Icon} from '../ui/Icon';
import IconButton from '../ui/IconButton';
import {formatLastSeen} from '../ui/presence';

interface Person {
  id: string;
  name: string;
  nearby: boolean;
  lastSeen: number;
  /** Shown only when two people picked the same name */
  tag?: string;
}

export function usePeople(): Person[] {
  const selfId = useIdentityStore(s => s.identity?.publicKeyBase58);
  const routes = useMeshService(s => s.routes);
  // Re-derive when conversations reload so renames show immediately.
  const conversations = useMessagesStore(s => s.conversations);
  return useMemo(() => {
    let known: {id: string; lastSeen: number}[] = [];
    try {
      known = dbListPeers();
    } catch {}
    const byId = new Map<string, Person>();
    for (const r of routes) {
      byId.set(r.id, {id: r.id, name: displayName(r.id, r.alias), nearby: true, lastSeen: Date.now()});
    }
    for (const p of known) {
      if (p.id === selfId || byId.has(p.id)) continue;
      byId.set(p.id, {id: p.id, name: displayName(p.id), nearby: false, lastSeen: p.lastSeen});
    }
    const people = [...byId.values()].filter(p => p.id !== selfId);
    const counts = new Map<string, number>();
    people.forEach(p => counts.set(p.name.toLowerCase(), (counts.get(p.name.toLowerCase()) ?? 0) + 1));
    people.forEach(p => {
      if ((counts.get(p.name.toLowerCase()) ?? 0) > 1) p.tag = formatShortId(p.id);
    });
    return people.sort((a, b) =>
      a.nearby !== b.nearby ? (a.nearby ? -1 : 1) : a.nearby ? a.name.localeCompare(b.name) : b.lastSeen - a.lastSeen,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- conversations is a refresh trigger only
  }, [routes, selfId, conversations]);
}

export function PersonRow({
  person,
  onPress,
  right,
  accessibilityRole = 'button',
  accessibilityState,
}: {
  person: Person;
  onPress: () => void;
  right?: React.ReactNode;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
}) {
  const {theme: t} = useThemeStore();
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={({pressed}) => [styles.row, pressed && {backgroundColor: t.surface}]}>
      <Avatar id={person.id} name={person.name} size={48} online={person.nearby} />
      <View style={{flex: 1}}>
        <Text style={[styles.name, {color: t.text}]} numberOfLines={1}>
          {person.name}
          {person.tag ? <Text style={{color: t.textMuted, fontFamily: Font.regular}}>  {person.tag}</Text> : null}
        </Text>
        <Text style={[styles.sub, {color: person.nearby ? t.online : t.textMuted}]}>
          {person.nearby ? 'Nearby' : person.lastSeen ? `Last seen ${formatLastSeen(person.lastSeen)}` : 'Not nearby'}
        </Text>
      </View>
      {right}
    </Pressable>
  );
}

/** Concentric pulse used while nobody has been found yet. */
export function Searching({title, subtitle}: {title: string; subtitle: string}) {
  const {theme: t} = useThemeStore();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true}),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const ring = (delay: number) => {
    const p = Animated.modulo(Animated.add(pulse, delay), 1);
    return {
      transform: [{scale: p.interpolate({inputRange: [0, 1], outputRange: [0.6, 1.9]})}],
      opacity: p.interpolate({inputRange: [0, 0.7, 1], outputRange: [0.5, 0.12, 0]}),
    };
  };
  return (
    <View style={styles.searching}>
      <View style={styles.radar}>
        {[0, 0.33, 0.66].map(d => (
          <Animated.View key={d} style={[styles.ring, {backgroundColor: t.primary}, ring(d)]} />
        ))}
        <View style={[styles.radarCore, {backgroundColor: t.primary}]}>
          <Icon name="people" size={30} color={t.onPrimary} />
        </View>
      </View>
      <Text style={[Type.title, {color: t.text, textAlign: 'center'}]}>{title}</Text>
      <Text style={[styles.searchingText, {color: t.textSub}]}>{subtitle}</Text>
    </View>
  );
}

export default function PeopleScreen() {
  const {theme: t} = useThemeStore();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const asPicker = useRoute<any>().name === 'NewMessage';
  const people = usePeople();
  const nearby = people.filter(p => p.nearby);
  const recent = people.filter(p => !p.nearby);

  const open = (id: string) =>
    asPicker ? navigation.replace('Chat', {conversationId: id}) : navigation.navigate('Chat', {conversationId: id});

  const sections = [
    ...(nearby.length ? [{title: 'Nearby now', data: nearby}] : []),
    ...(recent.length ? [{title: 'Recently nearby', data: recent}] : []),
  ];

  return (
    <View style={[styles.container, {backgroundColor: t.bg}]}>
      <View style={[styles.header, asPicker && styles.headerModal, {paddingTop: insets.top + (asPicker ? 8 : 14)}]}>
        {asPicker && <IconButton accessibilityLabel="Close" name="close" onPress={() => navigation.goBack()} />}
        <Text accessibilityRole="header" style={[asPicker ? Type.title : styles.bigTitle, {color: t.text, flex: 1}]}>
          {asPicker ? 'New message' : 'People'}
        </Text>
      </View>

      <Pressable
        onPress={() => navigation.navigate('NewGroup')}
        style={({pressed}) => [styles.row, pressed && {backgroundColor: t.surface}]}>
        <View style={[styles.action, {backgroundColor: t.primarySoft}]}>
          <Icon name="people" size={22} color={t.primary} />
        </View>
        <Text style={[styles.name, {color: t.text}]}>New group</Text>
      </Pressable>

      {sections.length === 0 ? (
        <Searching
          title="Looking for people nearby"
          subtitle="Anyone close by with Aetheris open will appear here. Make sure Bluetooth is on for both of you."
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={p => p.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{paddingBottom: 40}}
          renderSectionHeader={({section}) => (
            <Text style={[styles.section, {color: t.textMuted}]}>{section.title}</Text>
          )}
          renderItem={({item}) => <PersonRow person={item} onPress={() => open(item.id)} />}
          ListFooterComponent={
            nearby.length === 0 ? (
              <Text style={[styles.hint, {color: t.textMuted}]}>
                Looking for people nearby… You can still message recent people; messages are delivered when
                they're close again.
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bigTitle: {fontFamily: Font.extraBold, fontSize: 27, letterSpacing: -0.6},
  container: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingBottom: 10},
  headerModal: {paddingHorizontal: 8},
  row: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10},
  action: {width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center'},
  name: {fontFamily: Font.semiBold, fontSize: 16.5},
  sub: {fontFamily: Font.medium, fontSize: 13, marginTop: 2},
  section: {fontFamily: Font.semiBold, fontSize: 13, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6},
  hint: {fontFamily: Font.regular, fontSize: 13, lineHeight: 19, paddingHorizontal: 20, paddingTop: 18},
  searching: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 60},
  radar: {width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginBottom: 20},
  ring: {position: 'absolute', width: 90, height: 90, borderRadius: 45},
  radarCore: {width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center'},
  searchingText: {fontFamily: Font.regular, fontSize: 14.5, lineHeight: 21, textAlign: 'center', marginTop: 8},
});
