import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, FlatList, Pressable, TextInput, ScrollView} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {openSettings} from 'react-native-permissions';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Font, Type, useThemeStore} from '../theme';
import {Conversation, useMessagesStore} from '../store/messagesStore';
import {useMeshService} from '../store/meshService';
import {useDraftsStore} from '../store/draftsStore';
import {useIdentityStore} from '../store/identityStore';
import Avatar from '../ui/Avatar';
import {Icon} from '../ui/Icon';
import {showDialog} from '../ui/dialog';
import {statusLabel} from '../ui/a11y';
import Chip from '../ui/Chip';
import {displayName} from '../store/messagesStore';
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
  const draft = useDraftsStore(s => s.drafts[item.id]);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({pressed}) => [styles.row, pressed && {backgroundColor: t.surface}]}>
      <Avatar id={item.id} name={item.title} size={48} online={nearby} group={item.isGroup} />
      <View style={styles.rowBody}>
        <View style={styles.rowLine}>
          <Text style={[styles.name, {color: t.text}]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.time, {color: unread ? t.primaryText : t.textMuted}]}>
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
                  ? t.tickRead
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
            {draft?.trim() ? (
              <>
                <Text style={{color: t.primaryText, fontFamily: Font.semiBold}}>Draft: </Text>
                {draft.trim()}
              </>
            ) : (
              item.lastMessage || ' '
            )}
          </Text>
          {unread && (
            <View style={[styles.badge, {backgroundColor: t.primary}]}>
              <Text style={[styles.badgeText, {color: t.onPrimary}]}>{item.unread > 99 ? '99+' : item.unread}</Text>
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
      showDialog(
        line.text,
        // The raw radio error is in Settings > Help > Send a problem report.
        `${MESH_TIPS_TITLE}\n\n${MESH_TIPS}`,
        // Start returns early while running, so a radio error has nothing to retry.
        status === 'error' ? [{text: 'Close', style: 'cancel'}, {text: 'Try again', onPress: retry}] : [{text: 'Got it'}],
        {icon: 'help-buoy-outline', tone: 'warning'},
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

  return null;
}

/** Compact "● 4 nearby" pill in the header. */
function NearbyPill() {
  const {theme: t} = useThemeStore();
  const {status, routes} = useMeshService();
  const n = routes.length;
  const text = status !== 'running' ? 'Starting…' : n === 0 ? 'Looking…' : `${n} nearby`;
  return (
    <View
      accessible
      accessibilityLabel={status !== 'running' ? 'Starting' : n === 0 ? 'Looking for people nearby' : `${n} ${n === 1 ? 'person' : 'people'} nearby`}
      style={[styles.pill, {backgroundColor: t.surface}]}>
      <View style={[styles.statusDot, {backgroundColor: n > 0 ? t.online : t.textMuted}]} />
      <Text style={[styles.pillText, {color: t.textSub}]}>{text}</Text>
    </View>
  );
}

type Filter = 'all' | 'unread' | 'nearby' | 'groups';

export default function ChatsScreen() {
  const {theme: t} = useThemeStore();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const conversations = useMessagesStore(s => s.conversations);
  const {loadConversations} = useMessagesStore.getState();
  const {deleteConversation} = useMeshService.getState();
  const routes = useMeshService(s => s.routes);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => navigation.addListener('focus', loadConversations), [navigation, loadConversations]);

  const unreadChats = conversations.filter(c => c.unread > 0).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter(c => {
      if (q && !c.title.toLowerCase().includes(q)) return false;
      if (filter === 'unread') return c.unread > 0;
      if (filter === 'groups') return c.isGroup;
      if (filter === 'nearby') return !c.isGroup && isNearby(c.id, routes);
      return true;
    });
  }, [conversations, query, filter, routes]);

  const confirmDelete = (c: Conversation) =>
    showDialog(`Delete chat with ${c.title}?`, 'Messages are deleted from this phone.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => deleteConversation(c.id)},
    ]);

  const openChat = (id: string) => navigation.navigate('Chat', {conversationId: id});

  const header = (
    <View>
      <View style={[styles.searchWrap]}>
        <View style={[styles.search, {backgroundColor: t.surface}]}>
          <Icon name="search" size={18} color={t.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search chats"
            placeholderTextColor={t.textMuted}
            accessibilityLabel="Search chats"
            style={[styles.searchInput, {color: t.text}]}
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery('')}>
              <Icon name="close-circle" size={18} color={t.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <StatusLine />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All" on={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Unread" count={unreadChats || undefined} on={filter === 'unread'} onPress={() => setFilter('unread')} />
        <Chip label="Nearby" on={filter === 'nearby'} onPress={() => setFilter('nearby')} />
        <Chip label="Groups" on={filter === 'groups'} onPress={() => setFilter('groups')} />
      </ScrollView>
      {filter === 'all' && !query && routes.length > 0 && (
        <View style={styles.nearbyBlock}>
          <Text style={[styles.sectionLabel, {color: t.textMuted}]}>Nearby now</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nearbyRow}>
            {routes.map(r => {
              const name = displayName(r.id, r.alias);
              return (
                <Pressable
                  key={r.id}
                  onPress={() => openChat(r.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${name}, nearby`}
                  style={({pressed}) => [styles.nearbyItem, pressed && {opacity: 0.7}]}>
                  <View style={[styles.ring, {borderColor: t.primary}]}>
                    <Avatar id={r.id} name={name} size={48} />
                  </View>
                  <Text numberOfLines={1} style={[styles.nearbyName, {color: t.text}]}>
                    {name.split(' ')[0]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, {backgroundColor: t.bg}]}>
      <View style={[styles.header, {paddingTop: insets.top + 14}]}>
        <Text style={[styles.title, {color: t.text}]} accessibilityRole="header">
          Aetheris
        </Text>
        <NearbyPill />
      </View>

      {conversations.length === 0 ? (
        <>
          {header}
          <View style={styles.empty}>
            <View style={[styles.emptyArt, {backgroundColor: t.primarySoft}]}>
              <Icon name="chatbubbles" size={46} color={t.primaryText} />
            </View>
            <Text style={[Type.title, {color: t.text, textAlign: 'center'}]}>Start a conversation</Text>
            <Text style={[styles.emptyText, {color: t.textSub}]}>
              Message anyone around you who has Aetheris. No internet or phone number needed.
            </Text>
            <Button
              title="Find people nearby"
              icon="people"
              onPress={() => navigation.navigate('NewMessage')}
              style={{marginTop: 24, alignSelf: 'stretch'}}
            />
          </View>
        </>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={c => c.id}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{paddingBottom: 110}}
          ListEmptyComponent={
            <Text style={[styles.noMatch, {color: t.textMuted}]}>
              {query ? `No chats match "${query.trim()}"` : filter === 'unread' ? "You're all caught up" : filter === 'nearby' ? 'No one you chat with is nearby right now' : 'No group chats yet'}
            </Text>
          }
          renderItem={({item}) => (
            <ChatRow
              item={item}
              nearby={!item.isGroup && isNearby(item.id, routes)}
              onPress={() => openChat(item.id)}
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
            {backgroundColor: pressed ? t.primaryPressed : t.primary, shadowColor: t.shadow},
          ]}>
          <Icon name="create" size={22} color={t.onPrimary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 10},
  title: {fontFamily: Font.extraBold, fontSize: 24, letterSpacing: -0.5},
  pill: {flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 14},
  pillText: {fontFamily: Font.semiBold, fontSize: 12.5},
  statusDot: {width: 8, height: 8, borderRadius: 4},
  problem: {flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 14},
  problemText: {flex: 1, fontFamily: Font.medium, fontSize: 13.5},
  problemAction: {fontFamily: Font.bold, fontSize: 13.5},
  searchWrap: {paddingHorizontal: 16, paddingBottom: 12},
  search: {flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, height: 42, borderRadius: 21},
  searchInput: {flex: 1, fontFamily: Font.regular, fontSize: 15, paddingVertical: 0},
  chips: {flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 6},
  nearbyBlock: {paddingTop: 12, paddingBottom: 4},
  sectionLabel: {fontFamily: Font.semiBold, fontSize: 13, paddingHorizontal: 20, paddingBottom: 10},
  nearbyRow: {gap: 6, paddingHorizontal: 12},
  nearbyItem: {width: 64, alignItems: 'center', gap: 5},
  ring: {borderWidth: 2, borderRadius: 29, padding: 2},
  nearbyName: {fontFamily: Font.medium, fontSize: 12, maxWidth: 62},
  row: {flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 9},
  rowBody: {flex: 1, gap: 3},
  rowLine: {flexDirection: 'row', alignItems: 'center', gap: 8},
  name: {flex: 1, fontFamily: Font.semiBold, fontSize: 15.5},
  time: {fontFamily: Font.medium, fontSize: 11.5},
  preview: {flex: 1, fontFamily: Font.regular, fontSize: 14},
  badge: {minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6},
  badgeText: {fontFamily: Font.bold, fontSize: 11},
  noMatch: {fontFamily: Font.medium, fontSize: 14, textAlign: 'center', paddingTop: 40, paddingHorizontal: 30},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 80},
  emptyArt: {width: 104, height: 104, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 22},
  emptyText: {fontFamily: Font.regular, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8},
  fab: {
    position: 'absolute', right: 16, bottom: 18, width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    elevation: 5, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: {width: 0, height: 4},
  },
});
