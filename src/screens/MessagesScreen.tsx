import React, {useEffect} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity, Alert} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {useNavigation} from '@react-navigation/native';
import {useThemeStore, Font} from '../theme';
import {Conversation, useMessagesStore} from '../store/messagesStore';
import {useMeshService} from '../store/meshService';

function timeLabel(ts?: number): string {
  if (!ts) return '';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

function Row({item, reachable, onPress, onLongPress}: {
  item: Conversation;
  reachable: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const {theme: t} = useThemeStore();
  return (
    <TouchableOpacity
      style={[styles.row, {borderBottomColor: t.border}]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      activeOpacity={0.7}>
      <View style={[styles.avatar, {backgroundColor: t.accentSoft, borderColor: t.accentBorder}]}>
        {item.isGroup ? (
          <Icon name="users" size={18} color={t.accent} />
        ) : (
          <Text style={[styles.avatarText, {color: t.accent}]}>{item.title.slice(0, 2).toUpperCase()}</Text>
        )}
        {reachable && <View style={[styles.online, {backgroundColor: t.online, borderColor: t.bg}]} />}
      </View>
      <View style={{flex: 1}}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, {color: t.text}]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.time, {color: t.textMuted}]}>{timeLabel(item.lastTime)}</Text>
        </View>
        <View style={styles.rowTop}>
          <Text style={[styles.preview, {color: t.textSub}]} numberOfLines={1}>
            {item.lastMessage || ' '}
          </Text>
          {item.unread > 0 && (
            <View style={[styles.badge, {backgroundColor: t.accent}]}>
              <Text style={styles.badgeText}>{item.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MessagesScreen() {
  const {theme: t} = useThemeStore();
  const navigation = useNavigation<any>();
  const conversations = useMessagesStore(s => s.conversations);
  const {loadConversations, deleteConversation} = useMessagesStore.getState();
  const routes = useMeshService(s => s.routes);

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadConversations);
    return unsub;
  }, [navigation, loadConversations]);

  const confirmDelete = (c: Conversation) =>
    Alert.alert('Delete conversation', `Delete all messages with ${c.title} on this phone?`, [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => deleteConversation(c.id)},
    ]);

  return (
    <View style={[styles.container, {backgroundColor: t.bg}]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, {color: t.text}]}>Messages</Text>
          <Text style={[styles.subtitle, {color: t.textMuted}]}>Encrypted, no internet needed</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.headerButton, {backgroundColor: t.surfaceAlt, borderColor: t.border}]}
            onPress={() => navigation.navigate('NewGroup')}>
            <Icon name="users" size={16} color={t.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerButton, {backgroundColor: t.accent, borderColor: t.accent}]}
            onPress={() => navigation.navigate('NewChat')}>
            <Icon name="edit" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {conversations.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="message-circle" size={32} color={t.textMuted} />
          <Text style={[styles.emptyTitle, {color: t.text}]}>No conversations yet</Text>
          <Text style={[styles.emptySub, {color: t.textMuted}]}>
            Open the Mesh tab to see who's reachable, or start a chat with someone's ID.
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={c => c.id}
          contentContainerStyle={{paddingBottom: 80}}
          renderItem={({item}) => (
            <Row
              item={item}
              reachable={!item.isGroup && routes.some(r => r.id === item.id)}
              onPress={() => navigation.navigate('Chat', {conversationId: item.id})}
              onLongPress={() => confirmDelete(item)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16},
  title: {fontSize: 28, fontFamily: Font.extraBold, letterSpacing: -0.5},
  subtitle: {fontSize: 13, fontFamily: Font.regular, marginTop: 2},
  actions: {flexDirection: 'row', gap: 8},
  headerButton: {width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth},
  avatar: {width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1},
  avatarText: {fontSize: 15, fontFamily: Font.bold},
  online: {position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2},
  rowTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8},
  name: {flex: 1, fontSize: 15, fontFamily: Font.semiBold},
  time: {fontSize: 11, fontFamily: Font.regular},
  preview: {flex: 1, fontSize: 13, fontFamily: Font.regular, marginTop: 3},
  badge: {minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6},
  badgeText: {color: '#fff', fontSize: 11, fontFamily: Font.bold},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40, paddingBottom: 80},
  emptyTitle: {fontSize: 17, fontFamily: Font.semiBold},
  emptySub: {fontSize: 14, fontFamily: Font.regular, textAlign: 'center', lineHeight: 20},
});
