import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {openSettings} from 'react-native-permissions';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Font, Type, useThemeStore} from '../theme';
import {Conversation, useMessagesStore} from '../store/messagesStore';
import {useMeshService} from '../store/meshService';
import {useIdentityStore} from '../store/identityStore';
import Avatar from '../ui/Avatar';
import {Icon} from '../ui/Icon';
import {statusLabel} from '../ui/a11y';
import IconButton from '../ui/IconButton';
import Button from '../ui/Button';
import {MESH_TIPS, MESH_TIPS_TITLE, meshStatusLine} from '../ui/meshStatus';
import {formatListTime, isNearby} from '../ui/presence';

function ChatRow({item, nearby, onPress, onLongPress}: {
  item: Conversation;
  nearby: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const {theme: t} = useThemeStore();
  const unread = item.unread > 0;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({pressed}) => [styles.row, pressed && {backgroundColor: t.surface}]}>
      <Avatar id={item.id} name={item.title} size={54} online={nearby} group={item.isGroup} />
      <View style={styles.rowBody}>
        <View style={styles.rowLine}>
          <Text style={[styles.name, {color: t.text}]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.time, {color: unread ? t.primary : t.textMuted}]}>
            {item.lastTime ? formatListTime(item.lastTime) : ''}
          </Text>
        </View>
        <View style={styles.rowLine}>
          {item.lastOutboundStatus && (
            <View accessible accessibilityLabel={statusLabel(item.lastOutboundStatus)} style={{marginRight: -4}}>
            <Icon
              name={
                item.lastOutboundStatus === 'pending'
                  ? 'time-outline'
                  : item.lastOutboundStatus === 'failed'
                  ? 'alert-circle'
                  : item.lastOutboundStatus === 'delivered'
                  ? 'checkmark-done'
                  : 'checkmark'
              }
              size={16}
              color={
                item.lastOutboundStatus === 'delivered'
                  ? t.primary
                  : item.lastOutboundStatus === 'failed'
                  ? t.danger
                  : t.textMuted
              }
            />
            </View>
          )}
          <Text
            style={[styles.preview, {color: unread ? t.text : t.textSub}, unread && {fontFamily: Font.medium}]}
            numberOfLines={1}>
            {item.lastMessage || ' '}
          </Text>
          {unread && (
            <View style={[styles.badge, {backgroundColor: t.primary}]}>
              <Text style={styles.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** One quiet line under the title: how many people are around, or what's wrong. */
function StatusLine() {
  const {theme: t} = useThemeStore();
  const identity = useIdentityStore(s => s.identity);
  const {status, permission, bluetoothOn, routes, error, errorCode, bootstrap} = useMeshService();

  const line = meshStatusLine({status, permission, bluetoothOn, error, errorCode, routeCount: routes.length});
  const retry = () => identity && bootstrap(identity.publicKeyBase58);

  if (line.tone === 'warning') {
    const permissionProblem = permission === 'blocked' || permission === 'denied' || !bluetoothOn;
    const showHelp = () =>
      Alert.alert(
        line.text,
        `${error ?? 'Unknown error'}\n\n${MESH_TIPS_TITLE}\n${MESH_TIPS}`,
        // Start returns early while running, so a radio error has nothing to retry.
        status === 'error' ? [{text: 'Close', style: 'cancel'}, {text: 'Try again', onPress: retry}] : [{text: 'OK'}],
      );
    const action = permission === 'blocked' ? 'Settings' : permissionProblem ? (permission === 'denied' ? 'Allow' : 'Retry') : 'Help';
    const onPress = permission === 'blocked' ? () => openSettings() : permissionProblem ? retry : showHelp;
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${line.text}. ${action}`}
        style={[styles.problem, {backgroundColor: t.warningSoft}]}>
        <Icon name="alert-circle" size={18} color={t.warningText} />
        <Text style={[styles.problemText, {color: t.warningText}]}>{line.text}</Text>
        <Text style={[styles.problemAction, {color: t.warningText}]}>{action}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.status}>
      <View style={[styles.statusDot, {backgroundColor: routes.length > 0 ? t.online : t.textMuted}]} />
      <Text style={[styles.statusText, {color: t.textSub}]}>{line.text}</Text>
    </View>
  );
}

export default function ChatsScreen() {
  const {theme: t} = useThemeStore();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const conversations = useMessagesStore(s => s.conversations);
  const {loadConversations} = useMessagesStore.getState();
  const {deleteConversation} = useMeshService.getState();
  const routes = useMeshService(s => s.routes);
  const [query, setQuery] = useState('');

  useEffect(() => navigation.addListener('focus', loadConversations), [navigation, loadConversations]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? conversations.filter(c => c.title.toLowerCase().includes(q)) : conversations;
  }, [conversations, query]);

  const confirmDelete = (c: Conversation) =>
    Alert.alert(`Delete chat with ${c.title}?`, 'Messages are deleted from this phone.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => deleteConversation(c.id)},
    ]);

  return (
    <View style={[styles.container, {backgroundColor: t.bg}]}>
      <View style={[styles.header, {paddingTop: insets.top + 56}]}>
        <Text style={[Type.largeTitle, {color: t.text}]}>Chats</Text>
        <IconButton accessibilityLabel="New message" name="create-outline" onPress={() => navigation.navigate('NewMessage')} />
      </View>
      <StatusLine />

      {conversations.length > 0 && (
        <View style={[styles.search, {backgroundColor: t.surface}]}>
          <Icon name="search" size={18} color={t.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={t.textMuted}
            style={[styles.searchInput, {color: t.text}]}
          />
        </View>
      )}

      {conversations.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyArt, {backgroundColor: t.primarySoft}]}>
            <Icon name="chatbubbles" size={48} color={t.primary} />
          </View>
          <Text style={[Type.title, {color: t.text, textAlign: 'center'}]}>No chats yet</Text>
          <Text style={[styles.emptyText, {color: t.textSub}]}>
            Message anyone around you who has Aetheris — no internet needed.
          </Text>
          <Button
            title="Find people nearby"
            icon="people"
            onPress={() => navigation.navigate('NewMessage')}
            style={{marginTop: 24, alignSelf: 'stretch'}}
          />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={c => c.id}
          contentContainerStyle={{paddingBottom: 100}}
          renderItem={({item}) => (
            <ChatRow
              item={item}
              nearby={!item.isGroup && isNearby(item.id, routes)}
              onPress={() => navigation.navigate('Chat', {conversationId: item.id})}
              onLongPress={() => confirmDelete(item)}
            />
          )}
        />
      )}

      {conversations.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New message"
          onPress={() => navigation.navigate('NewMessage')}
          style={({pressed}) => [
            styles.fab,
            {backgroundColor: pressed ? t.primaryPressed : t.primary, shadowColor: t.primary},
          ]}>
          <Icon name="chatbubbles" size={24} color={t.onPrimary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20},
  status: {flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, marginTop: 2, marginBottom: 14},
  statusDot: {width: 8, height: 8, borderRadius: 4},
  statusText: {fontFamily: Font.medium, fontSize: 13.5},
  problem: {flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 6, marginBottom: 14, padding: 12, borderRadius: 14},
  problemText: {flex: 1, fontFamily: Font.medium, fontSize: 13.5},
  problemAction: {fontFamily: Font.bold, fontSize: 13.5},
  search: {flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 14, height: 42, borderRadius: 14},
  searchInput: {flex: 1, fontFamily: Font.regular, fontSize: 15, paddingVertical: 0},
  row: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10},
  rowBody: {flex: 1, gap: 3},
  rowLine: {flexDirection: 'row', alignItems: 'center', gap: 8},
  name: {flex: 1, fontFamily: Font.semiBold, fontSize: 16.5},
  time: {fontFamily: Font.medium, fontSize: 12},
  preview: {flex: 1, fontFamily: Font.regular, fontSize: 14.5},
  badge: {minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6},
  badgeText: {color: '#fff', fontFamily: Font.bold, fontSize: 11.5},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 80},
  emptyArt: {width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center', marginBottom: 22},
  emptyText: {fontFamily: Font.regular, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8},
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 60, height: 60, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: {width: 0, height: 6},
  },
});
