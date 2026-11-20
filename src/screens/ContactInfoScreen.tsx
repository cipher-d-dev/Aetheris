import React, {useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Alert, TextInput, Modal, Pressable} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Font, Type, useThemeStore} from '../theme';
import {
  conversationTitle,
  displayName,
  groupIdOf,
  isGroupConversation,
  useMessagesStore,
} from '../store/messagesStore';
import {useMeshService} from '../store/meshService';
import {useIdentityStore} from '../store/identityStore';
import {dbGetGroup, dbGetPeer, dbSetNickname} from '../db/database';
import Avatar from '../ui/Avatar';
import IconButton from '../ui/IconButton';
import ListRow, {Section} from '../ui/ListRow';
import Button from '../ui/Button';
import {isNearby, presenceText} from '../ui/presence';

export default function ContactInfoScreen() {
  const {theme: t} = useThemeStore();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const conversationId: string = useRoute<any>().params?.conversationId ?? '';
  const isGroup = isGroupConversation(conversationId);
  const selfId = useIdentityStore(s => s.identity?.publicKeyBase58 ?? '');
  const routes = useMeshService(s => s.routes);
  const [, refresh] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');

  const title = conversationTitle(conversationId);
  const group = isGroup ? dbGetGroup(groupIdOf(conversationId)) : null;
  const peer = isGroup ? null : dbGetPeer(conversationId);

  const saveName = () => {
    dbSetNickname(conversationId, draft);
    useMessagesStore.getState().refresh(conversationId);
    setRenaming(false);
    refresh(n => n + 1);
  };

  const deleteChat = () =>
    Alert.alert(`Delete chat with ${title}?`, 'Messages are deleted from this phone.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          useMeshService.getState().deleteConversation(conversationId);
          navigation.popToTop();
        },
      },
    ]);

  return (
    <View style={{flex: 1, backgroundColor: t.bg}}>
      <View style={[styles.header, {paddingTop: insets.top + 40}]}>
        <IconButton accessibilityLabel="Back" name="chevron-back" size={26} onPress={() => navigation.goBack()} />
      </View>
      <ScrollView contentContainerStyle={{paddingBottom: 40 + insets.bottom}}>
        <View style={styles.hero}>
          <Avatar
            id={conversationId}
            name={title}
            size={104}
            group={isGroup}
            online={!isGroup && isNearby(conversationId, routes)}
          />
          <Text style={[Type.title, styles.name, {color: t.text}]}>{title}</Text>
          <Text style={[styles.sub, {color: t.textSub}]}>
            {isGroup ? `Group · ${group?.members.length ?? 0} people` : presenceText(conversationId, routes)}
          </Text>
          {peer?.nickname && peer.alias && peer.alias !== peer.nickname && (
            <Text style={[styles.sub, {color: t.textMuted}]}>Calls themselves “{peer.alias}”</Text>
          )}
        </View>

        {!isGroup && (
          <Section>
            <ListRow
              icon="pencil"
              title="Edit name"
              subtitle="Only you see this name"
              onPress={() => {
                setDraft(peer?.nickname ?? '');
                setRenaming(true);
              }}
            />
          </Section>
        )}

        {group && (
          <Section title="Members">
            {group.members.map(id => (
              <View key={id} style={styles.member}>
                <Avatar id={id} name={id === selfId ? 'You' : displayName(id)} size={40} online={isNearby(id, routes)} />
                <View style={{flex: 1}}>
                  <Text style={[styles.memberName, {color: t.text}]}>{id === selfId ? 'You' : displayName(id)}</Text>
                  {id !== selfId && (
                    <Text style={[styles.memberSub, {color: t.textMuted}]}>{presenceText(id, routes)}</Text>
                  )}
                </View>
              </View>
            ))}
          </Section>
        )}

        <Section>
          <ListRow icon="trash-outline" iconColor={t.danger} title="Delete chat" danger onPress={deleteChat} />
        </Section>
      </ScrollView>

      <Modal visible={renaming} transparent animationType="fade" onRequestClose={() => setRenaming(false)}>
        <Pressable style={[styles.backdrop, {backgroundColor: t.overlay}]} onPress={() => setRenaming(false)}>
          <Pressable style={[styles.sheet, {backgroundColor: t.bg}]}>
            <Text style={[Type.title, {color: t.text}]}>Edit name</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={peer?.alias ?? 'Name'}
              placeholderTextColor={t.textMuted}
              autoFocus
              maxLength={32}
              style={[styles.input, {color: t.text, backgroundColor: t.surface}]}
              onSubmitEditing={saveName}
            />
            <Button title="Save" onPress={saveName} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {paddingHorizontal: 4},
  hero: {alignItems: 'center', paddingTop: 4, paddingBottom: 4},
  name: {marginTop: 14, textAlign: 'center', paddingHorizontal: 20},
  sub: {fontFamily: Font.medium, fontSize: 14, marginTop: 4},
  member: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10},
  memberName: {fontFamily: Font.semiBold, fontSize: 15},
  memberSub: {fontFamily: Font.regular, fontSize: 12.5, marginTop: 1},
  backdrop: {flex: 1, justifyContent: 'center', padding: 24},
  sheet: {borderRadius: 24, padding: 20, gap: 14},
  input: {height: 52, borderRadius: 14, paddingHorizontal: 16, fontFamily: Font.medium, fontSize: 16},
});
