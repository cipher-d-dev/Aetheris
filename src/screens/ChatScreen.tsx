import React, {useEffect, useRef, useState} from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Image,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Font, useThemeStore} from '../theme';
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
import {dbGetGroup} from '../db/database';
import {useIdentityStore} from '../store/identityStore';
import Avatar, {senderTextColor} from '../ui/Avatar';
import {Icon} from '../ui/Icon';
import {statusLabel} from '../ui/a11y';
import IconButton from '../ui/IconButton';
import {keyboardAvoidingBehavior, useKeyboardVisible} from '../ui/keyboard';
import {formatClock, isNearby, presenceText} from '../ui/presence';
import {routeText} from '../ui/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long'});
}

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/** Deterministic pseudo-waveform so each voice note looks distinct. */
function waveform(seed: string, bars = 28): number[] {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Array.from({length: bars}, (_, i) => {
    h = (h * 1103515245 + 12345) | 0;
    const r = ((h >>> 8) % 1000) / 1000;
    const envelope = Math.sin((Math.PI * (i + 1)) / (bars + 1));
    return 0.25 + 0.75 * r * envelope;
  });
}

// ─── Ticks ────────────────────────────────────────────────────────────────────

function Ticks({m, color}: {m: ChatMessage; color: string}) {
  const icon =
    m.status === 'pending' ? (
      <Icon name="time-outline" size={14} color={color} />
    ) : m.status === 'failed' ? (
      <Icon name="alert-circle" size={15} color="#FFD7D9" />
    ) : (
      <Icon
        name={m.status === 'delivered' ? 'checkmark-done' : 'checkmark'}
        size={16}
        color={m.status === 'delivered' ? '#FFFFFF' : color}
      />
    );
  return (
    <View accessible accessibilityLabel={statusLabel(m.status)}>
      {icon}
    </View>
  );
}

// ─── Bubble ───────────────────────────────────────────────────────────────────

function Bubble({
  m,
  first,
  last,
  showSender,
  playing,
  onPlay,
  onImage,
  onLongPress,
}: {
  m: ChatMessage;
  first: boolean;
  last: boolean;
  showSender: boolean;
  playing: boolean;
  onPlay: () => void;
  onImage: (uri: string) => void;
  onLongPress: () => void;
}) {
  const {theme: t} = useThemeStore();
  const out = m.isOutbound;
  const fg = out ? t.bubbleOutText : t.bubbleInText;
  const meta = out ? t.bubbleOutMeta : t.bubbleInMeta;
  const uri = m.kind === 'image' && m.media ? `data:${m.media.mime};base64,${m.media.data}` : null;
  const aspect = m.media?.width && m.media?.height ? m.media.width / m.media.height : 1;
  const big = 20;
  const small = 6;

  const radius = out
    ? {borderTopLeftRadius: big, borderBottomLeftRadius: big, borderTopRightRadius: first ? big : small, borderBottomRightRadius: last ? small : small}
    : {borderTopRightRadius: big, borderBottomRightRadius: big, borderTopLeftRadius: first ? big : small, borderBottomLeftRadius: last ? small : small};
  if (out && first && last) radius.borderBottomRightRadius = small;
  if (!out && first && last) radius.borderBottomLeftRadius = small;

  const timeAndTicks = (
    <View style={styles.meta}>
      <Text style={[styles.metaText, {color: meta}]}>{formatClock(m.createdAt)}</Text>
      {out && <Ticks m={m} color={meta} />}
    </View>
  );

  return (
    <View style={[styles.row, out ? styles.rowOut : styles.rowIn, last && {marginBottom: 6}]}>
      <Pressable
        {...(m.kind === 'audio' && {
          accessibilityRole: 'button' as const,
          accessibilityLabel: playing ? 'Pause voice message' : 'Play voice message',
        })}
        onLongPress={onLongPress}
        delayLongPress={300}
        onPress={() => (uri ? onImage(uri) : m.kind === 'audio' ? onPlay() : undefined)}
        style={[
          styles.bubble,
          radius,
          {backgroundColor: out ? t.bubbleOut : t.bubbleIn},
          uri && styles.imageBubble,
          !t.isDark && !out && styles.inShadow,
        ]}>
        {showSender && !out && (
          <Text style={[styles.sender, {color: senderTextColor(m.senderId, t.isDark)}]}>
            {displayName(m.senderId, m.senderAlias)}
          </Text>
        )}
        {uri && <Image source={{uri}} style={[styles.image, radius, {aspectRatio: aspect}]} resizeMode="cover" />}
        {m.kind === 'audio' && (
          <View style={styles.audio}>
            <View style={[styles.playButton, {backgroundColor: out ? 'rgba(255,255,255,0.22)' : t.primary}]}>
              <Icon name={playing ? 'pause' : 'play'} size={18} color="#FFFFFF" style={!playing && {marginLeft: 2}} />
            </View>
            <View style={styles.wave}>
              {waveform(m.id).map((h, i) => (
                <View key={i} style={[styles.waveBar, {height: 4 + h * 22, backgroundColor: out ? 'rgba(255,255,255,0.75)' : t.textMuted}]} />
              ))}
            </View>
            <Text style={[styles.audioTime, {color: meta}]}>{duration(m.media?.durationMs ?? 0)}</Text>
          </View>
        )}
        {m.text ? (
          <View style={[styles.textRow, uri && styles.caption]}>
            <Text style={[styles.text, {color: fg}]}>{m.text}</Text>
            <View style={styles.inlineMeta}>{timeAndTicks}</View>
          </View>
        ) : (
          <View style={[styles.metaWrap, uri && styles.metaOnImage]}>{timeAndTicks}</View>
        )}
      </Pressable>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const {theme: t} = useThemeStore();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const navigation = useNavigation<any>();
  const conversationId: string = useRoute<any>().params?.conversationId ?? '';
  const isGroup = isGroupConversation(conversationId);
  const selfId = useIdentityStore(s => s.identity?.publicKeyBase58 ?? '');

  const messages = useMessagesStore(s => s.messages[conversationId]) ?? [];
  const {loadMessages, setActiveConversation} = useMessagesStore.getState();
  const {sendToConversation, routes, status, deleteMessage, retryMessage} = useMeshService();

  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const listRef = useRef<FlatList>(null);
  const nearBottom = useRef(true);
  const forceStick = useRef(false);
  const lastSeenId = useRef<string | undefined>(undefined);
  const lastOffset = useRef(0);

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
    if (recordingSince === null) return;
    const timer = setInterval(() => setElapsed(Date.now() - recordingSince), 200);
    return () => clearInterval(timer);
  }, [recordingSince]);

  const title = conversationTitle(conversationId);
  const group = isGroup ? dbGetGroup(groupIdOf(conversationId)) : null;
  const nearby = !isGroup && isNearby(conversationId, routes);
  const subtitle = isGroup
    ? (group?.members ?? [])
        .filter(id => id !== selfId)
        .map(id => displayName(id))
        .concat('You')
        .join(', ')
    : presenceText(conversationId, routes);

  const last = messages[messages.length - 1];
  const lastId = last?.id;
  const lastInbound = last ? !last.isOutbound : false;
  useEffect(() => {
    if (lastId === lastSeenId.current) return;
    lastSeenId.current = lastId;
    if (lastInbound && !nearBottom.current) setShowNew(true);
  }, [lastId, lastInbound]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const {contentOffset, layoutMeasurement, contentSize} = e.nativeEvent;
    const y = contentOffset.y;
    if (contentSize.height - (y + layoutMeasurement.height) < 80) {
      nearBottom.current = true;
      setShowNew(false);
    } else if (y < lastOffset.current) {
      // Only an upward scroll means the user left the bottom. Our own jumps
      // to the bottom only move down, and their scroll event can arrive after
      // a new message has already grown the content.
      nearBottom.current = false;
    }
    lastOffset.current = y;
  };

  // Scroll the underlying ScrollView, which uses the real content height.
  // FlatList.scrollToEnd uses the list's own size estimate, which can lag
  // behind the newest message and leave it just out of view.
  const scrollToBottom = (animated: boolean) => {
    const scrollView = listRef.current?.getNativeScrollRef() as ScrollView | null | undefined;
    scrollView?.scrollToEnd({animated});
  };

  const onContentSizeChange = () => {
    if (nearBottom.current || forceStick.current) {
      scrollToBottom(false);
      nearBottom.current = true;
      forceStick.current = false;
    }
  };

  const jumpToNew = () => {
    scrollToBottom(true);
    setShowNew(false);
  };

  const send = async (content: Parameters<typeof sendToConversation>[1]) => {
    forceStick.current = true;
    setError('');
    if (status !== 'running') {
      setError("Can't send yet — Aetheris is still starting. Check Bluetooth is on.");
      return;
    }
    try {
      await sendToConversation(conversationId, content);
    } catch (e: any) {
      setError(e?.message ?? 'Could not send');
    }
  };

  const sendText = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    send({kind: 'text', text});
  };

  const attachPhoto = async () => {
    try {
      setBusy(true);
      const img = await AetherisBridge.pickImage(1024, 60);
      if (!img) return;
      if (img.data.length > MAX_MEDIA_BASE64) {
        setError('That photo is too large to send.');
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

  const startRecording = async () => {
    if (!(await requestMicrophone())) {
      setError('Allow the microphone to send voice messages.');
      return;
    }
    try {
      await AetherisBridge.startRecording();
      setElapsed(0);
      setRecordingSince(Date.now());
    } catch (e: any) {
      setError(e?.message ?? 'Could not start recording');
    }
  };

  const finishRecording = async () => {
    setRecordingSince(null);
    try {
      const audio = await AetherisBridge.stopRecording();
      await send({kind: 'audio', media: {mime: audio.mime, data: audio.data, durationMs: audio.durationMs}});
    } catch (e: any) {
      setError(e?.message ?? 'Recording failed');
    }
  };

  const cancelRecording = () => {
    setRecordingSince(null);
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

  const info = (m: ChatMessage) => {
    const routeLine = routeText(m.route, m.isOutbound, selfId, id => displayName(id));
    const viaText = routeLine ? `\n\n${routeLine}` : '';
    let text: string;
    if (!m.isOutbound) text = `Received at ${formatClock(m.createdAt)}.${viaText}`;
    else if (m.status === 'delivered')
      text = m.recipientCount
        ? `Delivered to ${m.deliveredCount} of ${m.recipientCount}.`
        : `Delivered.${viaText}`;
    else if (m.status === 'failed') text = "This message couldn't be delivered.";
    else
      text = isGroup
        ? `Delivered to ${m.deliveredCount ?? 0} of ${m.recipientCount ?? 0}. The rest get it when they're nearby.`
        : `Not delivered yet. ${title} will get it when they're nearby.`;
    Alert.alert('Message info', text);
  };

  const menu = (m: ChatMessage) => {
    const del = {
      text: 'Delete',
      style: 'destructive' as const,
      onPress: () =>
        Alert.alert('Delete message?', 'It will be removed from this phone.', [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Delete', style: 'destructive', onPress: () => deleteMessage(m.id)},
        ]),
    };
    if (m.isOutbound && m.status === 'failed') {
      Alert.alert('Not delivered', undefined, [
        {text: 'Cancel', style: 'cancel'},
        del,
        {text: 'Try again', onPress: () => retryMessage(m.id).catch(e => setError(String(e?.message ?? e)))},
      ]);
      return;
    }
    Alert.alert('Message', undefined, [
      {text: 'Cancel', style: 'cancel'},
      del,
      {text: 'Info', onPress: () => info(m)},
    ]);
  };

  type Item =
    | {type: 'day'; key: string; ts: number}
    | {type: 'msg'; key: string; m: ChatMessage; first: boolean; last: boolean; showSender: boolean};
  const items: Item[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
    if (newDay) items.push({type: 'day', key: `day-${m.id}`, ts: m.createdAt});
    const sameAsPrev = !newDay && prev && prev.senderId === m.senderId && m.createdAt - prev.createdAt < 120000;
    const sameAsNext =
      next &&
      next.senderId === m.senderId &&
      next.createdAt - m.createdAt < 120000 &&
      new Date(next.createdAt).toDateString() === new Date(m.createdAt).toDateString();
    items.push({type: 'msg', key: m.id, m, first: !sameAsPrev, last: !sameAsNext, showSender: isGroup && !sameAsPrev});
  });

  const recording = recordingSince !== null;

  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: t.chatBg}} behavior={keyboardAvoidingBehavior()}>
      {/* Header */}
      <View style={[styles.header, {paddingTop: insets.top + 40, backgroundColor: t.bg, borderBottomColor: t.separator}]}>
        <IconButton accessibilityLabel="Back" name="chevron-back" size={26} onPress={() => navigation.goBack()} />
        <Pressable
          style={styles.headerWho}
          onPress={() => navigation.navigate('ContactInfo', {conversationId})}>
          <Avatar id={conversationId} name={title} size={40} online={nearby} group={isGroup} />
          <View style={{flex: 1}}>
            <Text style={[styles.headerName, {color: t.text}]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.headerSub, {color: nearby ? t.online : t.textMuted}]} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.listWrap}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={i => i.key}
        contentContainerStyle={styles.list}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View style={[styles.notice, {backgroundColor: t.isDark ? t.surface : '#FFFFFF'}]}>
            <Icon name="lock-closed" size={13} color={t.textMuted} />
            <Text style={[styles.noticeText, {color: t.textSub}]}>
              Messages are end-to-end encrypted. They may hop through other Aetheris phones on the
              way, and those phones can't read them. No internet involved.
            </Text>
          </View>
        }
        renderItem={({item}) =>
          item.type === 'day' ? (
            <View style={styles.dayWrap}>
              <Text style={[styles.day, {color: t.textSub, backgroundColor: t.isDark ? t.surface : '#FFFFFF'}]}>
                {dayLabel(item.ts)}
              </Text>
            </View>
          ) : (
            <Bubble
              m={item.m}
              first={item.first}
              last={item.last}
              showSender={item.showSender}
              playing={playingId === item.m.id}
              onPlay={() => play(item.m)}
              onImage={setViewer}
              onLongPress={() => menu(item.m)}
            />
          )
        }
      />
      {showNew && (
        <Pressable
          onPress={jumpToNew}
          accessibilityRole="button"
          accessibilityLabel="Scroll to new messages"
          style={[styles.newPill, {backgroundColor: t.surface}]}>
          <Icon name="arrow-down" size={14} color={t.primary} />
          <Text style={[styles.newPillText, {color: t.text}]}>New messages</Text>
        </Pressable>
      )}
      </View>

      {!isGroup && !nearby && messages.some(m => m.isOutbound && m.status !== 'delivered' && m.status !== 'failed') && (
        <View style={[styles.away, {backgroundColor: t.isDark ? t.surface : '#FFFFFF'}]}>
          <Icon name="time-outline" size={15} color={t.textSub} />
          <Text style={[styles.awayText, {color: t.textSub}]}>
            {title} isn't nearby. Your messages will be delivered when they are.
          </Text>
        </View>
      )}

      {error !== '' && (
        <Pressable onPress={() => setError('')} style={[styles.error, {backgroundColor: t.dangerSoft}]}>
          <Text style={[styles.errorText, {color: t.danger}]}>{error}</Text>
          <Icon name="close" size={16} color={t.danger} />
        </Pressable>
      )}

      {/* Composer */}
      <View style={[styles.composer, {backgroundColor: t.bg, paddingBottom: 10 + (keyboardVisible ? 0 : insets.bottom)}]}>
        {recording ? (
          <>
            <IconButton accessibilityLabel="Discard recording" name="trash-outline" color={t.danger} onPress={cancelRecording} />
            <View style={[styles.recording, {backgroundColor: t.surface}]}>
              <View style={[styles.recDot, {backgroundColor: t.danger}]} />
              <Text style={[styles.recText, {color: t.text}]}>{duration(elapsed)}</Text>
              <Text style={[styles.recHint, {color: t.textMuted}]}>Recording…</Text>
            </View>
            <IconButton accessibilityLabel="Send voice message" name="send" size={20} filled onPress={finishRecording} style={styles.sendButton} />
          </>
        ) : (
          <>
            <View style={[styles.inputWrap, {backgroundColor: t.surface}]}>
              <TextInput
                style={[styles.input, {color: t.text}]}
                placeholder="Message"
                placeholderTextColor={t.textMuted}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={4000}
              />
              {busy ? (
                <ActivityIndicator color={t.primary} style={{marginRight: 12}} />
              ) : (
                <IconButton accessibilityLabel="Attach photo" name="camera-outline" size={23} color={t.textSub} onPress={attachPhoto} style={styles.inlineIcon} />
              )}
            </View>
            {input.trim() ? (
              <IconButton accessibilityLabel="Send message" name="send" size={20} filled onPress={sendText} style={styles.sendButton} />
            ) : (
              <IconButton accessibilityLabel="Record voice message" name="mic" size={22} filled onPress={startRecording} style={styles.sendButton} />
            )}
          </>
        )}
      </View>

      <Modal visible={viewer !== null} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)}>
          {viewer && <Image source={{uri: viewer}} style={styles.viewerImage} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {flexDirection: 'row', alignItems: 'center', paddingBottom: 8, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth},
  headerWho: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11},
  headerName: {fontFamily: Font.semiBold, fontSize: 16.5},
  headerSub: {fontFamily: Font.medium, fontSize: 12.5, marginTop: 1},
  listWrap: {flex: 1},
  newPill: {position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, shadowColor: '#0F1419', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: {width: 0, height: 2}, elevation: 4},
  newPillText: {fontFamily: Font.semiBold, fontSize: 13},
  list: {paddingHorizontal: 10, paddingTop: 10, paddingBottom: 12, flexGrow: 1},
  notice: {flexDirection: 'row', gap: 8, alignSelf: 'center', maxWidth: 320, padding: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 12, alignItems: 'flex-start'},
  noticeText: {flex: 1, fontFamily: Font.regular, fontSize: 12, lineHeight: 17, textAlign: 'center'},
  dayWrap: {alignItems: 'center', marginVertical: 10},
  day: {fontFamily: Font.semiBold, fontSize: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, overflow: 'hidden'},
  row: {flexDirection: 'row', marginVertical: 1.5},
  rowOut: {justifyContent: 'flex-end', paddingLeft: 56},
  rowIn: {justifyContent: 'flex-start', paddingRight: 56},
  bubble: {paddingHorizontal: 12, paddingTop: 8, paddingBottom: 7, maxWidth: '100%'},
  inShadow: {shadowColor: '#0F1419', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: {width: 0, height: 1}, elevation: 1},
  imageBubble: {padding: 3, width: 260},
  sender: {fontFamily: Font.semiBold, fontSize: 13, marginBottom: 2},
  image: {width: '100%'},
  caption: {paddingHorizontal: 9, paddingTop: 6},
  text: {fontFamily: Font.regular, fontSize: 15.5, lineHeight: 21.5, flexShrink: 1},
  textRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'flex-end'},
  inlineMeta: {marginLeft: 10, marginBottom: -1, flexGrow: 0},
  metaWrap: {position: 'absolute', right: 10, bottom: 6},
  metaOnImage: {right: 10, bottom: 8, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1},
  meta: {flexDirection: 'row', alignItems: 'center', gap: 3},
  metaText: {fontFamily: Font.medium, fontSize: 11},
  audio: {flexDirection: 'row', alignItems: 'center', gap: 10, width: 230, paddingBottom: 14},
  playButton: {width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center'},
  wave: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 28},
  waveBar: {flex: 1, borderRadius: 2},
  audioTime: {position: 'absolute', left: 48, bottom: -2, fontFamily: Font.medium, fontSize: 11},
  away: {flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 12},
  awayText: {flex: 1, fontFamily: Font.regular, fontSize: 12.5, lineHeight: 17},
  error: {flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 12},
  errorText: {flex: 1, fontFamily: Font.medium, fontSize: 13},
  composer: {flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 8},
  inputWrap: {flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 22, minHeight: 44},
  input: {flex: 1, maxHeight: 130, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontFamily: Font.regular, fontSize: 15.5},
  inlineIcon: {width: 40, height: 44},
  sendButton: {width: 44, height: 44, borderRadius: 22},
  recording: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderRadius: 22, paddingHorizontal: 16},
  recDot: {width: 10, height: 10, borderRadius: 5},
  recText: {fontFamily: Font.semiBold, fontSize: 15},
  recHint: {fontFamily: Font.regular, fontSize: 14},
  viewer: {flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center'},
  viewerImage: {width: '100%', height: '100%'},
});
