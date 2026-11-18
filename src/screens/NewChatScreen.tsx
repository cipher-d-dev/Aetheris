import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {useNavigation} from '@react-navigation/native';
import {useThemeStore, Font} from '../theme';
import {dbListPeers, dbResolvePeerId} from '../db/database';
import {useMeshService} from '../store/meshService';
import {useIdentityStore} from '../store/identityStore';
import {displayName} from '../store/messagesStore';
import {formatShortId} from '../crypto/encoding';

/** Header + list of people we know about (met directly or seen in routing). */
export function usePeople() {
  const selfId = useIdentityStore(s => s.identity?.publicKeyBase58);
  const routes = useMeshService(s => s.routes);
  return useMemo(() => {
    let peers: {id: string; alias?: string}[] = [];
    try {
      peers = dbListPeers();
    } catch {}
    return peers
      .filter(p => p.id !== selfId)
      .map(p => ({...p, hops: routes.find(r => r.id === p.id)?.hops}))
      .sort((a, b) => (a.hops ?? 99) - (b.hops ?? 99));
  }, [routes, selfId]);
}

export function PersonRow({
  id,
  alias,
  hops,
  selected,
  onPress,
}: {
  id: string;
  alias?: string;
  hops?: number;
  selected?: boolean;
  onPress: () => void;
}) {
  const {theme: t} = useThemeStore();
  return (
    <TouchableOpacity
      style={[styles.person, {backgroundColor: t.surface, borderColor: selected ? t.accent : t.border}]}
      onPress={onPress}
      activeOpacity={0.7}>
      <View style={[styles.avatar, {backgroundColor: t.accentSoft}]}>
        <Icon name="user" size={16} color={t.accent} />
      </View>
      <View style={{flex: 1}}>
        <Text style={[styles.name, {color: t.text}]}>{displayName(id, alias)}</Text>
        <Text style={[styles.sub, {color: t.textMuted}]}>
          {formatShortId(id)} ·{' '}
          {hops === undefined ? 'not reachable now' : hops === 1 ? 'in range' : `${hops} hops`}
        </Text>
      </View>
      {selected !== undefined && (
        <Icon name={selected ? 'check-circle' : 'circle'} size={20} color={selected ? t.accent : t.textMuted} />
      )}
    </TouchableOpacity>
  );
}

export default function NewChatScreen() {
  const {theme: t} = useThemeStore();
  const navigation = useNavigation<any>();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const people = usePeople();

  const start = () => {
    const id = dbResolvePeerId(input);
    if (!id) {
      setError("Unknown ID. Paste their full ID, or use a short ID of someone you've met on the mesh.");
      return;
    }
    navigation.replace('Chat', {conversationId: id});
  };

  return (
    <View style={[styles.container, {backgroundColor: t.bg}]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.back, {backgroundColor: t.surfaceAlt, borderColor: t.border}]}>
          <Icon name="arrow-left" size={18} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.title, {color: t.text}]}>New chat</Text>
      </View>

      <View style={[styles.inputWrap, {backgroundColor: t.surface, borderColor: error ? t.errorText : t.border}]}>
        <TextInput
          style={[styles.input, {color: t.text}]}
          placeholder="Their ID (full, or XXXX-XXXX)"
          placeholderTextColor={t.textMuted}
          value={input}
          onChangeText={v => {
            setInput(v);
            setError('');
          }}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={start}
        />
        <TouchableOpacity onPress={start} disabled={!input.trim()}>
          <Icon name="arrow-right" size={20} color={input.trim() ? t.accent : t.textMuted} />
        </TouchableOpacity>
      </View>
      {error !== '' && <Text style={[styles.error, {color: t.errorText}]}>{error}</Text>}

      <Text style={[styles.section, {color: t.textMuted}]}>PEOPLE YOU'VE SEEN ON THE MESH</Text>
      <FlatList
        data={people}
        keyExtractor={p => p.id}
        contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 40}}
        ListEmptyComponent={
          <Text style={[styles.empty, {color: t.textMuted}]}>
            Nobody yet. People appear here once their phone is reachable through the mesh.
          </Text>
        }
        renderItem={({item}) => (
          <PersonRow
            id={item.id}
            alias={item.alias}
            hops={item.hops}
            onPress={() => navigation.replace('Chat', {conversationId: item.id})}
          />
        )}
      />
    </View>
  );
}

export const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16},
  back: {width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1},
  title: {fontSize: 20, fontFamily: Font.bold},
  inputWrap: {flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14},
  input: {flex: 1, height: 50, fontSize: 15, fontFamily: Font.regular},
  error: {marginHorizontal: 20, marginTop: 8, fontSize: 12, fontFamily: Font.regular},
  section: {fontSize: 10, fontFamily: Font.bold, letterSpacing: 2, marginHorizontal: 20, marginTop: 24, marginBottom: 8},
  empty: {fontSize: 13, fontFamily: Font.regular, lineHeight: 19},
  person: {flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8},
  avatar: {width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  name: {fontSize: 14, fontFamily: Font.semiBold},
  sub: {fontSize: 11, fontFamily: Font.regular, marginTop: 2},
});
