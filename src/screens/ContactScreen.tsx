import React, {useState} from 'react';
import {View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useThemeStore, Font} from '../theme';
import {dbGetPeer, dbSetNickname} from '../db/database';
import {useMeshService} from '../store/meshService';
import {useIdentityStore} from '../store/identityStore';
import {displayName, useMessagesStore} from '../store/messagesStore';
import {addResultMessage, scanContact} from '../contacts/addContact';
import {formatShortId} from '../crypto/encoding';

export default function ContactScreen() {
  const {theme: t} = useThemeStore();
  const navigation = useNavigation<any>();
  const id: string = useRoute<any>().params?.id ?? '';
  const selfId = useIdentityStore(s => s.identity?.publicKeyBase58 ?? '');
  const route = useMeshService(s => s.routes.find(r => r.id === id));
  const [version, setVersion] = useState(0);
  const peer = dbGetPeer(id);
  const [nickname, setNickname] = useState(peer?.nickname ?? '');

  const saveNickname = () => {
    dbSetNickname(id, nickname);
    useMessagesStore.getState().refresh(id);
    setVersion(v => v + 1);
  };

  const verify = async () => {
    const result = await scanContact(selfId);
    if (!result.ok) {
      if (result.reason !== 'cancelled') Alert.alert('Could not verify', addResultMessage(result));
      return;
    }
    if (result.contact.id !== id) {
      Alert.alert(
        'Different person',
        `That code belongs to ${displayName(result.contact.id, result.contact.name)}, not this contact. They were added as a separate contact.`,
      );
      return;
    }
    setVersion(v => v + 1);
    Alert.alert('Verified', `You've confirmed this is ${displayName(id)}'s phone.`);
  };

  const verified = dbGetPeer(id)?.verified ?? false;
  void version;

  return (
    <ScrollView style={{flex: 1, backgroundColor: t.bg}} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.back, {backgroundColor: t.surfaceAlt, borderColor: t.border}]}>
          <Icon name="arrow-left" size={18} color={t.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.avatar, {backgroundColor: t.accentSoft, borderColor: t.accentBorder}]}>
        <Icon name="user" size={32} color={t.accent} />
      </View>
      <Text style={[styles.name, {color: t.text}]}>{displayName(id)}</Text>
      {peer?.alias && peer.nickname && (
        <Text style={[styles.sub, {color: t.textMuted}]}>Calls themselves "{peer.alias}"</Text>
      )}
      <Text style={[styles.sub, {color: t.textMuted}]}>
        {formatShortId(id)} ·{' '}
        {!route ? 'not reachable now' : route.hops === 1 ? 'in range' : `${route.hops} hops away`}
      </Text>

      <View
        style={[
          styles.card,
          verified
            ? {backgroundColor: t.successBg, borderColor: t.successBorder}
            : {backgroundColor: t.surface, borderColor: t.border},
        ]}>
        <Icon name={verified ? 'shield' : 'shield-off'} size={18} color={verified ? t.successText : t.textMuted} />
        <View style={{flex: 1}}>
          <Text style={[styles.cardTitle, {color: verified ? t.successText : t.text}]}>
            {verified ? 'Verified in person' : 'Not verified'}
          </Text>
          <Text style={[styles.cardText, {color: t.textSub}]}>
            {verified
              ? "You scanned their code, so messages are encrypted to their phone's real key."
              : 'Meet up and scan their QR code to confirm this is really them.'}
          </Text>
        </View>
      </View>
      {!verified && (
        <TouchableOpacity style={[styles.button, {backgroundColor: t.accent}]} onPress={verify}>
          <Icon name="maximize" size={16} color="#fff" />
          <Text style={styles.buttonText}>Scan their code</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.section, {color: t.textMuted}]}>NICKNAME (ONLY YOU SEE THIS)</Text>
      <View style={[styles.inputRow, {backgroundColor: t.surface, borderColor: t.border}]}>
        <TextInput
          style={[styles.input, {color: t.text}]}
          value={nickname}
          onChangeText={setNickname}
          placeholder={peer?.alias ?? 'Add a nickname'}
          placeholderTextColor={t.textMuted}
          maxLength={32}
          onSubmitEditing={saveNickname}
        />
        {nickname.trim() !== (peer?.nickname ?? '') && (
          <TouchableOpacity onPress={saveNickname}>
            <Text style={{color: t.accent, fontFamily: Font.bold}}>Save</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.section, {color: t.textMuted}]}>FULL ID</Text>
      <Text selectable style={[styles.fullId, {color: t.textSub, backgroundColor: t.surfaceAlt}]}>
        {id}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {paddingHorizontal: 20, paddingTop: 52, paddingBottom: 60},
  header: {flexDirection: 'row', marginBottom: 8},
  back: {width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1},
  avatar: {alignSelf: 'center', width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 12},
  name: {textAlign: 'center', fontSize: 22, fontFamily: Font.bold},
  sub: {textAlign: 'center', fontSize: 13, fontFamily: Font.regular, marginTop: 4},
  card: {flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 24},
  cardTitle: {fontSize: 14, fontFamily: Font.semiBold},
  cardText: {fontSize: 12, fontFamily: Font.regular, marginTop: 2, lineHeight: 17},
  button: {flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 13, marginTop: 12},
  buttonText: {color: '#fff', fontSize: 15, fontFamily: Font.semiBold},
  section: {fontSize: 10, fontFamily: Font.bold, letterSpacing: 2, marginTop: 28, marginBottom: 8},
  inputRow: {flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14},
  input: {flex: 1, height: 48, fontSize: 15, fontFamily: Font.regular},
  fullId: {fontSize: 12, fontFamily: Font.regular, padding: 12, borderRadius: 10, lineHeight: 18},
});
