import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useThemeStore, Font} from '../theme';
import {
  ChatMessage,
  conversationTitle,
  displayName,
  groupIdOf,
  isGroupConversation,
  useMessagesStore,
} from '../store/messagesStore';
import {MAX_MEDIA_BASE64, useMeshService} from '../store/meshService';
import {AetherisBridge} from '../native/AetherisBridge';
import {requestMicrophone} from '../native/permissions';
import {dbGetGroup, dbResolvePeerId} from '../db/database';
import {useIdentityStore} from '../store/identityStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDay(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, {weekday: 'long', month: 'short', day: 'numeric'});
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function routeDescription(m: ChatMessage, selfId: string): string {
  const relays = m.route ?? [];
  const from = m.isOutbound ? 'You' : displayName(m.senderId, m.senderAlias);
  const to = m.isOutbound ? conversationTitle(m.conversationId) : 'You';
  const chain = [from, ...relays.map(r => (r === selfId ? 'You' : displayName(r))), to];
  const hops = relays.length + 1;
  return `${chain.join(' → ')}\n\n${hops === 1 ? 'Direct (1 hop)' : `${hops} hops`}`;
}

// ─── Status ticks ─────────────────────────────────────────────────────────────

function StatusTicks({m}: {m: ChatMessage}) {
  const color = 'rgba(255,255,255,0.75)';
  if (m.status === 'pending') return <Icon name="clock" size={11} color={color} />;
  if (m.status === 'failed') return <Icon name="alert-circle" size={11} color="#FFD1D1" />;
  const delivered = m.status === 'delivered';
  return (
    <View style={styles.ticks}>
      {m.recipientCount ? (
        <Text style={[styles.groupCount, {color}]}>
          {m.deliveredCount ?? 0}/{m.recipientCount}
        </Text>
      ) : null}
      <Icon name="check" size={11} color={delivered ? '#FFFFFF' : color} />
      {delivered && <Icon name="check" size={11} color="#FFFFFF" style={styles.secondTick} />}
    </View>
  );
}

// ─── Bubble ───────────────────────────────────────────────────────────────────

function Bubble({
  m,
  showSender,
  playingId,
  onPlay,
  onOpenImage,
  onInfo,
}: {
  m: ChatMessage;
  showSender: boolean;
  playingId: string | null;
  onPlay: (m: ChatMessage) => void;
  onOpenImage: (uri: string) => void;
  onInfo: (m: ChatMessage) => void;
}) {
  const {theme: t} = useThemeStore();
  const out = m.isOutbound;
  const fg = out ? '#FFFFFF' : t.text;
  const sub = out ? 'rgba(255,255,255,0.7)' : t.textMuted;
  const uri = m.kind === 'image' && m.media ? `data:${m.media.mime};base64,${m.media.data}` : null;
  const aspect = m.media?.width && m.media?.height ? m.media.width / m.media.height : 1;

  return (
    <View style={[styles.row, out ? styles.rowOut : styles.rowIn]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => onInfo(m)}
        onPress={() => (uri ? onOpenImage(uri) : m.kind === 'audio' ? onPlay(m) : undefined)}
        style={[
          styles.bubble,
          out
            ? {backgroundColor: t.accent, borderBottomRightRadius: 4}
            : {backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderBottomLeftRadius: 4},
          uri ? styles.imageBubble : null,
        ]}>
        {showSender && !out && (
          <Text style={[styles.sender, {color: t.accent}]}>{displayName(m.senderId, m.senderAlias)}</Text>
        )}
        {uri && <Image source={{uri}} style={[styles.image, {aspectRatio: aspect}]} resizeMode="cover" />}
        {m.kind === 'audio' && (
          <View style={styles.audioRow}>
            <Icon name={playingId === m.id ? 'square' : 'play'} size={18} color={fg} />
            <View style={[styles.audioBar, {backgroundColor: sub}]} />
            <Text style={[styles.audioTime, {color: sub}]}>
              {formatDuration(m.media?.durationMs ?? 0)}
            </Text>
          </View>
        )}
        {!!m.text && <Text style={[styles.text, {color: fg}, uri ? styles.caption : null]}>{m.text}</Text>}
        <View style={[styles.meta, uri ? styles.caption : null]}>
          {(m.route?.length ?? 0) > 0 && (
            <Text style={[styles.metaText, {color: sub}]}>
              via {m.route!.length} relay{m.route!.length === 1 ? '' : 's'} ·
            </Text>
          )}
          <Text style={[styles.metaText, {color: sub}]}>{formatTime(m.createdAt)}</Text>
          {out && <StatusTicks m={m} />}
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const {theme: t} = useThemeStore();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const selfId = useIdentityStore(s => s.identity?.publicKeyBase58 ?? '');

  const rawId: string = route.params?.conversationId ?? route.params?.peerId ?? '';
  const conversationId = isGroupConversation(rawId) ? rawId : dbResolvePeerId(rawId) ?? rawId;
  const isGroup = isGroupConversation(conversationId);

  const messages = useMessagesStore(s => s.messages[conversationId]) ?? [];
  const {loadMessages, setActiveConversation} = useMessagesStore.getState();
  const {sendToConversation, routes, status} = useMeshService();

  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<number | null>(null);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    loadMessages(conversationId);
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId, loadMessages, setActiveConversation]);

  useEffect(() => {
    const sub = AetherisBridge.onAudioFinished(() => setPlayingId(null));
    return () => {
      sub.remove();
      AetherisBridge.stopAudio().catch(() => undefined);
      AetherisBridge.cancelRecording().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (recording === null) return;
    const timer = setInterval(() => setRecordElapsed(Date.now() - recording), 250);
    return () => clearInterval(timer);
  }, [recording]);

  // Header subtitle: how reachable is this person right now?
  let subtitle: string;
  if (isGroup) {
    const g = dbGetGroup(groupIdOf(conversationId));
    const others = (g?.members ?? []).filter(id => id !== selfId);
    const reachable = others.filter(id => routes.some(r => r.id === id)).length;
    subtitle = `${others.length + 1} members · ${reachable} reachable now`;
  } else {
    const r = routes.find(x => x.id === conversationId);
    subtitle = !r
      ? 'Not reachable now — messages will be carried'
      : r.hops === 1
      ? 'In range · direct link'
      : `${r.hops} hops away`;
  }

  const send = async (content: Parameters<typeof sendToConversation>[1]) => {
    setError('');
    if (status !== 'running') {
      setError('The mesh radio is not running. Check the Mesh tab.');
      return;
    }
    try {
      await sendToConversation(conversationId, content);
    } catch (e: any) {
      setError(e?.message ?? 'Could not send');
    }
  };

  const sendText = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await send({kind: 'text', text});
  };

  const attachImage = async () => {
    try {
      setBusy(true);
      const img = await AetherisBridge.pickImage(1024, 60);
      if (!img) return;
      if (img.data.length > MAX_MEDIA_BASE64) {
        setError('That photo is too large even after compression.');
        return;
      }
      const caption = input.trim();
      setInput('');
      await send({
        kind: 'image',
        text: caption || undefined,
        media: {mime: img.mime, data: img.data, width: img.width, height: img.height},
      });
    } catch (e: any) {
      setError(e?.message ?? 'Could not attach photo');
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    if (recording === null) {
      if (!(await requestMicrophone())) {
        setError('Microphone permission is needed for voice notes.');
        return;
      }
      try {
        await AetherisBridge.startRecording();
        setRecordElapsed(0);
        setRecording(Date.now());
      } catch (e: any) {
        setError(e?.message ?? 'Could not start recording');
      }
      return;
    }
    setRecording(null);
    try {
      const audio = await AetherisBridge.stopRecording();
      await send({kind: 'audio', media: {mime: audio.mime, data: audio.data, durationMs: audio.durationMs}});
    } catch (e: any) {
      setError(e?.message ?? 'Recording failed');
    }
  };

  const cancelRecording = () => {
    setRecording(null);
    AetherisBridge.cancelRecording().catch(() => undefined);
  };

  const play = (m: ChatMessage) => {
    if (!m.media) return;
    if (playingId === m.id) {
      AetherisBridge.stopAudio().catch(() => undefined);
      setPlayingId(null);
      return;
    }
    setPlayingId(m.id);
    AetherisBridge.playAudio(m.id, m.media.data).catch(() => setPlayingId(null));
  };

  const showInfo = (m: ChatMessage) => {
    const statusLine = m.isOutbound
      ? m.status === 'delivered'
        ? 'Delivered'
        : m.status === 'sent'
        ? 'Left this phone — waiting for delivery receipt'
        : m.status === 'pending'
        ? 'Waiting for someone in range'
        : 'Expired before it could be delivered'
      : 'Received';
    const route =
      m.isOutbound && m.status !== 'delivered'
        ? ''
        : m.route
        ? `\n\nRoute:\n${routeDescription(m, selfId)}`
        : '';
    Alert.alert('Message info', `${statusLine}${route}`);
  };

  type Item = {type: 'day'; key: string; ts: number} | {type: 'msg'; key: string; m: ChatMessage; showSender: boolean};
  const items: Item[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (!prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()) {
      items.push({type: 'day', key: `day-${m.id}`, ts: m.createdAt});
    }
    items.push({type: 'msg', key: m.id, m, showSender: isGroup && (!prev || prev.senderId !== m.senderId)});
  });

  return (
    <KeyboardAvoidingView
      style={{flex: 1, backgroundColor: t.bg}}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, {borderBottomColor: t.border}]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.back, {backgroundColor: t.surfaceAlt, borderColor: t.border}]}>
          <Icon name="arrow-left" size={18} color={t.text} />
        </TouchableOpacity>
        <View style={{flex: 1}}>
          <Text style={[styles.title, {color: t.text}]} numberOfLines={1}>
            {conversationTitle(conversationId)}
          </Text>
          <Text style={[styles.subtitle, {color: t.textMuted}]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Icon name={isGroup ? 'users' : 'lock'} size={16} color={t.textMuted} />
      </View>

      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={i => i.key}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({animated: true})}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Icon name="lock" size={22} color={t.textMuted} />
            <Text style={[styles.emptyText, {color: t.textMuted}]}>
              Messages are end-to-end encrypted. Phones that relay them can't read them.
            </Text>
          </View>
        }
        renderItem={({item}) =>
          item.type === 'day' ? (
            <Text style={[styles.day, {color: t.textMuted}]}>{formatDay(item.ts)}</Text>
          ) : (
            <Bubble
              m={item.m}
              showSender={item.showSender}
              playingId={playingId}
              onPlay={play}
              onOpenImage={setViewer}
              onInfo={showInfo}
            />
          )
        }
      />

      {error !== '' && (
        <TouchableOpacity
          onPress={() => setError('')}
          style={[styles.error, {backgroundColor: t.errorBg, borderColor: t.errorBorder}]}>
          <Text style={{color: t.errorText, fontFamily: Font.regular, fontSize: 12}}>{error}</Text>
        </TouchableOpacity>
      )}

      <View style={[styles.composer, {backgroundColor: t.surface, borderTopColor: t.border}]}>
        {recording !== null ? (
          <>
            <TouchableOpacity onPress={cancelRecording} style={styles.iconButton}>
              <Icon name="x" size={20} color={t.errorText} />
            </TouchableOpacity>
            <View style={styles.recordingInfo}>
              <View style={[styles.recDot, {backgroundColor: t.errorText}]} />
              <Text style={{color: t.text, fontFamily: Font.medium}}>
                Recording {formatDuration(recordElapsed)}
              </Text>
            </View>
            <TouchableOpacity onPress={toggleRecording} style={[styles.sendButton, {backgroundColor: t.accent}]}>
              <Icon name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={attachImage} style={styles.iconButton} disabled={busy}>
              {busy ? <ActivityIndicator color={t.accent} /> : <Icon name="image" size={20} color={t.textSub} />}
            </TouchableOpacity>
            <TextInput
              style={[styles.input, {color: t.text, backgroundColor: t.surfaceAlt, borderColor: t.border}]}
              placeholder="Message"
              placeholderTextColor={t.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={4000}
            />
            {input.trim() ? (
              <TouchableOpacity onPress={sendText} style={[styles.sendButton, {backgroundColor: t.accent}]}>
                <Icon name="send" size={16} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={toggleRecording} style={[styles.sendButton, {backgroundColor: t.accent}]}>
                <Icon name="mic" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      <Modal visible={viewer !== null} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <TouchableOpacity style={styles.viewer} activeOpacity={1} onPress={() => setViewer(null)}>
          {viewer && <Image source={{uri: viewer}} style={styles.viewerImage} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 48, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1},
  back: {width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1},
  title: {fontSize: 17, fontFamily: Font.semiBold},
  subtitle: {fontSize: 12, fontFamily: Font.regular, marginTop: 1},
  list: {padding: 12, paddingBottom: 20, flexGrow: 1},
  emptyWrap: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40},
  emptyText: {fontSize: 13, fontFamily: Font.regular, textAlign: 'center', lineHeight: 19},
  day: {textAlign: 'center', fontSize: 11, fontFamily: Font.medium, marginVertical: 10},
  row: {flexDirection: 'row', marginVertical: 2},
  rowOut: {justifyContent: 'flex-end'},
  rowIn: {justifyContent: 'flex-start'},
  bubble: {maxWidth: '80%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8},
  imageBubble: {padding: 4, width: '72%'},
  sender: {fontSize: 12, fontFamily: Font.semiBold, marginBottom: 2},
  image: {width: '100%', borderRadius: 14},
  caption: {paddingHorizontal: 8},
  text: {fontSize: 15, fontFamily: Font.regular, lineHeight: 21},
  audioRow: {flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 160, paddingVertical: 4},
  audioBar: {flex: 1, height: 3, borderRadius: 2, opacity: 0.6},
  audioTime: {fontSize: 12, fontFamily: Font.medium},
  meta: {flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 3},
  metaText: {fontSize: 10, fontFamily: Font.regular},
  ticks: {flexDirection: 'row', alignItems: 'center'},
  secondTick: {marginLeft: -6},
  groupCount: {fontSize: 10, fontFamily: Font.medium, marginRight: 3},
  error: {marginHorizontal: 12, marginBottom: 6, padding: 8, borderRadius: 10, borderWidth: 1},
  composer: {flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1},
  iconButton: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center'},
  input: {flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, fontFamily: Font.regular},
  sendButton: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center'},
  recordingInfo: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40},
  recDot: {width: 8, height: 8, borderRadius: 4},
  viewer: {flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center'},
  viewerImage: {width: '100%', height: '100%'},
});
