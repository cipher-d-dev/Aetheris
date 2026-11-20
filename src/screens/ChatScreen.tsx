import React, {useEffect, useMemo, useRef, useState} from 'react';
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
  Platform,
  AccessibilityInfo,
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
import {dbFindByRef, dbFirstUnread, dbGetGroup, dbGetMessage, dbGroupDeliveries} from '../db/database';
import {useDraftsStore} from '../store/draftsStore';
import {useIdentityStore} from '../store/identityStore';
import Avatar, {senderTextColor} from '../ui/Avatar';
import {Icon} from '../ui/Icon';
import {deliveryExplanation, statusLabel} from '../ui/a11y';
import IconButton from '../ui/IconButton';
import Wallpaper from '../ui/Wallpaper';
import SwipeToReply from '../ui/SwipeToReply';
import MessageMenu, {MessageMenuAction} from '../ui/MessageMenu';
import {keyboardAvoidingBehavior, useKeyboardVisible} from '../ui/keyboard';
import {buildItems, findArrivalsAbove} from '../ui/chatItems';
import {isLate, lateAccessibilityLabel, lateLabel} from '../ui/late';
import {formatClock, isNearby, presenceText} from '../ui/presence';
import {replySnippet, resolveQuote} from '../ui/reply';
import {groupReactions, nextReaction, REACTIONS, REACTION_NAMES} from '../ui/reactions';
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

function Ticks({m, color, readColor, danger, onPress}: {m: ChatMessage; color: string; readColor: string; danger: string; onPress: () => void}) {
  const icon =
    m.status === 'pending' ? (
      <Icon name="time-outline" size={14} color={color} />
    ) : m.status === 'failed' ? (
      <Icon name="alert-circle" size={15} color={danger} />
    ) : (
      <Icon
        name={m.status === 'delivered' ? 'checkmark-done' : 'checkmark'}
        size={16}
        color={m.status === 'delivered' ? readColor : color}
      />
    );
  return (
    <Pressable
      hitSlop={16}
      accessibilityRole="button"
      accessibilityLabel={`${statusLabel(m.status)}, tap for details`}
      onPress={onPress}>
      {icon}
    </Pressable>
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
  onStatus,
  highlight,
  quote,
  onQuote,
  onReply,
  reactions,
  onReact,
}: {
  m: ChatMessage;
  first: boolean;
  last: boolean;
  showSender: boolean;
  playing: boolean;
  onPlay: () => void;
  onImage: (uri: string) => void;
  onLongPress: () => void;
  onStatus: () => void;
  highlight: boolean;
  quote: ReturnType<typeof resolveQuote> | null;
  onQuote: (targetId: string | null) => void;
  onReply?: () => void;
  /** Chips under the bubble; tapping one reacts with (or removes) that emoji. */
  reactions: ReturnType<typeof groupReactions>;
  onReact: (emoji: string) => void;
}) {
  const {theme: t} = useThemeStore();
  const out = m.isOutbound;
  const fg = out ? t.bubbleOutText : t.bubbleInText;
  const meta = out ? t.bubbleOutMeta : t.bubbleInMeta;
  const uri = m.kind === 'image' && m.media ? `data:${m.media.mime};base64,${m.media.data}` : null;
  const aspect = m.media?.width && m.media?.height ? m.media.width / m.media.height : 1;
  // The first bubble of a run gets a small tail at its top corner.
  const r = 14;
  const radius = {
    borderTopLeftRadius: !out && first ? 0 : r,
    borderTopRightRadius: out && first ? 0 : r,
    borderBottomLeftRadius: r,
    borderBottomRightRadius: r,
  };
  const bubbleColor = out ? t.bubbleOut : t.bubbleIn;

  const timeAndTicks = (
    <View style={styles.meta}>
      {isLate(m) ? (
        <Text
          accessibilityLabel={lateAccessibilityLabel(m)}
          style={[styles.metaText, styles.lateText, {color: meta}]}>
          {lateLabel(m)}
        </Text>
      ) : (
        <Text style={[styles.metaText, {color: meta}]}>{formatClock(m.createdAt)}</Text>
      )}
      {out && <Ticks m={m} color={meta} readColor={t.tickRead} danger={t.danger} onPress={onStatus} />}
    </View>
  );

  const row = (
    <View
      style={[
        styles.row,
        out ? styles.rowOut : styles.rowIn,
        first && {marginTop: 5},
        last && {marginBottom: 2},
        highlight && {backgroundColor: t.primarySoft},
      ]}>
      <View style={[styles.stack, out ? styles.stackOut : styles.stackIn]}>
      <Pressable
        {...(m.kind === 'audio' && {
          accessibilityRole: 'button' as const,
          // The label replaces the children, so it has to say everything they show.
          accessibilityLabel: [
            `${playing ? 'Pause' : 'Play'} voice message, ${duration(m.media?.durationMs ?? 0)}`,
            showSender && !out ? `from ${displayName(m.senderId, m.senderAlias)}` : '',
            quote ? `reply to ${quote.name}` : '',
            isLate(m) ? lateAccessibilityLabel(m) : formatClock(m.createdAt),
            out ? statusLabel(m.status) : '',
          ]
            .filter(Boolean)
            .join(', '),
        })}
        // TalkBack focuses the bubble as one item, so the quote, the status tick
        // and the long-press menu are offered as actions too.
        accessibilityActions={[
          ...(onReply ? [{name: 'reply', label: 'Reply'}] : []),
          ...(quote?.targetId ? [{name: 'quote', label: 'Jump to original message'}] : []),
          ...(out ? [{name: 'status', label: 'Delivery details'}] : []),
          {name: 'menu', label: 'More options'},
        ]}
        onAccessibilityAction={e => {
          const a = e.nativeEvent.actionName;
          if (a === 'reply') onReply?.();
          else if (a === 'quote' && quote) onQuote(quote.targetId);
          else if (a === 'status') onStatus();
          else if (a === 'menu') onLongPress();
        }}
        onLongPress={onLongPress}
        delayLongPress={300}
        onPress={() => (uri ? onImage(uri) : m.kind === 'audio' ? onPlay() : undefined)}
        style={[
          styles.bubble,
          radius,
          {backgroundColor: bubbleColor},
          uri && styles.imageBubble,
          t.bubbleShadow && styles.shadow,
        ]}>
        {first && (
          <View
            pointerEvents="none"
            style={[
              styles.tail,
              out
                ? {right: -7, borderTopColor: bubbleColor, borderRightWidth: 8, borderRightColor: 'transparent'}
                : {left: -7, borderTopColor: bubbleColor, borderLeftWidth: 8, borderLeftColor: 'transparent'},
            ]}
          />
        )}
        {showSender && !out && (
          <Text style={[styles.sender, {color: senderTextColor(m.senderId, t.isDark)}]}>
            {displayName(m.senderId, m.senderAlias)}
          </Text>
        )}
        {quote && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reply to ${quote.name}: ${quote.snippet}.${quote.unverified ? ' Original message is not on this phone, so this is unverified.' : ''}`}
            accessibilityHint={quote.targetId ? 'Jumps to the original message' : undefined}
            onPress={() => onQuote(quote.targetId)}
            style={[
              styles.quote,
              {backgroundColor: out ? t.quoteOut : t.quoteIn},
              uri && styles.quoteOnImage,
            ]}>
            <View style={[styles.quoteStripe, {backgroundColor: t.quoteBar}]} />
            <View style={styles.quoteBody}>
              <Text numberOfLines={1} style={[styles.quoteName, {color: t.quoteName}]}>
                {quote.name}
              </Text>
              <Text numberOfLines={2} style={[styles.quoteText, {color: meta}]}>
                {quote.snippet}
              </Text>
            </View>
          </Pressable>
        )}
        {uri && <Image source={{uri}} style={[styles.image, radius, {aspectRatio: aspect}]} resizeMode="cover" />}
        {m.kind === 'audio' && (
          <View style={styles.audio}>
            <View style={[styles.playButton, {backgroundColor: t.primary}]}>
              <Icon name={playing ? 'pause' : 'play'} size={18} color={t.onPrimary} style={!playing && {marginLeft: 2}} />
            </View>
            <View style={styles.wave}>
              {waveform(m.id).map((h, i) => (
                <View key={i} style={[styles.waveBar, {height: 4 + h * 22, backgroundColor: meta, opacity: 0.75}]} />
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
      {reactions.length > 0 && (
        <View style={[styles.chips, out ? styles.chipsOut : styles.chipsIn]}>
          {reactions.map(g => (
            <Pressable
              key={g.emoji}
              accessibilityRole="button"
              accessibilityLabel={`${g.count} ${REACTION_NAMES[g.emoji] ?? g.emoji} ${g.count === 1 ? 'reaction' : 'reactions'}${
                g.mine ? ', including yours. Tap to remove yours' : `. Tap to react with ${REACTION_NAMES[g.emoji] ?? g.emoji}`
              }`}
              hitSlop={8}
              onPress={() => onReact(g.mine ? '' : g.emoji)}
              style={[
                styles.chip,
                {backgroundColor: g.mine ? t.primarySoft : t.chatHeader, borderColor: g.mine ? t.primary : t.border},
              ]}>
              <Text style={[styles.chipText, {color: t.text}]}>{g.count > 1 ? `${g.emoji} ${g.count}` : g.emoji}</Text>
            </Pressable>
          ))}
        </View>
      )}
      </View>
    </View>
  );
  return onReply ? <SwipeToReply onReply={onReply}>{row}</SwipeToReply> : row;
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

  const stored = useMessagesStore(s => s.messages[conversationId]);
  const messages = useMemo(() => stored ?? [], [stored]);
  const reactionsByRef = useMessagesStore(s => s.reactions[conversationId]);
  const anchor = useMessagesStore(s => s.unreadAnchor);
  const {loadMessages, setActiveConversation} = useMessagesStore.getState();
  const {sendToConversation, routes, status, deleteMessage, retryMessage, sendReaction} = useMeshService();

  const [input, setInput] = useState(() => useDraftsStore.getState().drafts[conversationId] ?? '');
  const changeInput = (text: string) => {
    setInput(text);
    useDraftsStore.getState().setDraft(conversationId, text);
  };
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [aboveId, setAboveId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [menuFor, setMenuFor] = useState<ChatMessage | null>(null);
  // A pending reply is kept per chat, like the draft, while its message still exists.
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(() => {
    const id = useDraftsStore.getState().replies[conversationId];
    const m = id ? dbGetMessage(id) : null;
    return m && m.conversationId === conversationId ? m : null;
  });
  useEffect(() => {
    useDraftsStore.getState().setReply(conversationId, replyingTo?.id ?? null);
  }, [conversationId, replyingTo]);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);
  // Known before the first render (nothing is marked read yet), so a chat that
  // opens at the unread divider never starts heading for the bottom.
  const [opensAtDivider] = useState(() => dbFirstUnread(conversationId) !== null);
  const nearBottom = useRef(!opensAtDivider);
  const forceStick = useRef(false);
  const lastSeenId = useRef<string | undefined>(undefined);
  // Ids already shown; null until the first non-empty load has been recorded.
  const seenIds = useRef<Set<string> | null>(null);
  const lastOffset = useRef(0);
  // While true, every layout change re-pins the divider: the first screens of
  // messages render in batches. Ends when the user drags or after a moment.
  const pendingAnchorScroll = useRef(opensAtDivider);
  const pinTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollRetries = useRef({left: 0});

  const pinnedDivider = useRef(false);
  const lastView = useRef<{y: number; height: number; contentHeight: number} | null>(null);
  useEffect(() => {
    if (!opensAtDivider) return;
    pinTimer.current = setTimeout(() => {
      pendingAnchorScroll.current = false;
      if (pinnedDivider.current) {
        // Scroll events during pinning were ignored; take the real position now.
        const v = lastView.current;
        nearBottom.current = v ? v.contentHeight - (v.y + v.height) < 80 : false;
      } else {
        // The first unread message wasn't among the loaded ones: open at the bottom.
        nearBottom.current = true;
        scrollToBottomRef.current(false);
      }
    }, 1000);
    return () => clearTimeout(pinTimer.current);
  }, [opensAtDivider]);

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

  const unreadAnchor = anchor?.conversationId === conversationId ? anchor : null;
  const items = buildItems(messages, isGroup, unreadAnchor?.id);
  const dividerIndex = items.findIndex(i => i.type === 'unread');

  const last = messages[messages.length - 1];
  const lastId = last?.id;
  const lastInbound = last ? !last.isOutbound : false;
  useEffect(() => {
    if (lastId === lastSeenId.current) return;
    lastSeenId.current = lastId;
    if (lastInbound && !nearBottom.current) setShowNew(true);
  }, [lastId, lastInbound]);

  useEffect(() => {
    if (messages.length === 0) return;
    // The first load is the baseline; the unread divider covers those messages.
    const arrivals =
      seenIds.current && !pendingAnchorScroll.current ? findArrivalsAbove(seenIds.current, messages) : [];
    seenIds.current = new Set(messages.map(m => m.id));
    if (arrivals.length === 0) return;
    const first = messages.findIndex(m => m.id === arrivals[0]);
    setAboveId(prev => {
      const prevIndex = prev ? messages.findIndex(m => m.id === prev) : -1;
      return prevIndex >= 0 && prevIndex < first ? prev : arrivals[0];
    });
  }, [messages]);

  useEffect(() => () => clearTimeout(highlightTimer.current), []);
  useEffect(() => () => useDraftsStore.getState().flushDrafts(), []);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const {contentOffset, layoutMeasurement, contentSize} = e.nativeEvent;
    const y = contentOffset.y;
    lastView.current = {y, height: layoutMeasurement.height, contentHeight: contentSize.height};
    // While the divider is being pinned, these are our own interim jumps.
    if (pendingAnchorScroll.current) {
      lastOffset.current = y;
      return;
    }
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
  const scrollToBottomRef = useRef(scrollToBottom);
  scrollToBottomRef.current = scrollToBottom;

  const scrollToIndex = (index: number) => {
    scrollRetries.current.left = 3;
    nearBottom.current = false;
    listRef.current?.scrollToIndex({index, viewPosition: 0, animated: false});
  };

  /** Scroll so the message sits at the top of the list, optionally tinting it for a moment. */
  const scrollToMessage = (id: string, opts?: {highlight?: boolean}) => {
    const index = items.findIndex(i => i.type === 'msg' && i.key === id);
    if (index < 0) return;
    scrollToIndex(index);
    if (opts?.highlight) {
      setHighlightId(id);
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 1500);
    }
  };

  // Items are not measured up front: jump near the target, then retry once it has been laid out.
  const onScrollToIndexFailed = (info: {index: number; averageItemLength: number}) => {
    if (scrollRetries.current.left <= 0) return;
    scrollRetries.current.left -= 1;
    listRef.current?.scrollToOffset({offset: info.averageItemLength * info.index, animated: false});
    setTimeout(
      () => listRef.current?.scrollToIndex({index: info.index, viewPosition: 0, animated: false}),
      100,
    );
  };

  const onContentSizeChange = () => {
    if (pendingAnchorScroll.current && dividerIndex >= 0) {
      pinnedDivider.current = true;
      scrollToIndex(dividerIndex);
      return;
    }
    if (pendingAnchorScroll.current) return; // divider not in the list yet
    if (nearBottom.current || forceStick.current) {
      scrollToBottom(false);
      nearBottom.current = true;
      forceStick.current = false;
    }
  };

  const onQuote = (targetId: string | null) => {
    if (targetId) scrollToMessage(targetId, {highlight: true});
    else setNotice("Original message isn't loaded");
  };

  const jumpToAbove = () => {
    if (aboveId) scrollToMessage(aboveId, {highlight: true});
    setAboveId(null);
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
      return false;
    }
    try {
      await sendToConversation(conversationId, content);
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Could not send');
      return false;
    }
  };

  // The draft stays stored while a send is in flight: drop it once the send
  // worked, or put the text back if it failed. Skipped if the user has typed
  // something new meanwhile.
  const settleDraft = (ok: boolean, sent: string, replied: ChatMessage | null = null) => {
    if (!ok && replied) setReplyingTo(cur => cur ?? replied);
    const {drafts, clearDraft} = useDraftsStore.getState();
    if ((drafts[conversationId] ?? '') !== sent) return;
    if (ok) clearDraft(conversationId);
    else setInput(cur => cur || sent);
  };

  const startReply = (m: ChatMessage) => {
    setReplyingTo(m);
    inputRef.current?.focus();
    AccessibilityInfo.announceForAccessibility(`Replying to ${m.isOutbound ? 'yourself' : displayName(m.senderId, m.senderAlias)}`);
  };

  const replyContent = (m: ChatMessage | null) =>
    m ? {replyTo: {id: m.refId, senderId: m.senderId, snippet: replySnippet(m)}} : {};

  const sendText = () => {
    const text = input.trim();
    if (!text) return;
    const replied = replyingTo;
    setInput('');
    setReplyingTo(null);
    send({kind: 'text', text, ...replyContent(replied)}).then(ok => settleDraft(ok, text, replied));
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
      const replied = replyingTo;
      setInput('');
      setReplyingTo(null);
      const ok = await send({
        kind: 'image',
        text: caption || undefined,
        ...replyContent(replied),
        media: {mime: img.mime, data: img.data, width: img.width, height: img.height},
      });
      settleDraft(ok, caption, replied);
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
      const replied = replyingTo;
      setReplyingTo(null);
      const ok = await send({
        kind: 'audio',
        ...replyContent(replied),
        media: {mime: audio.mime, data: audio.data, durationMs: audio.durationMs},
      });
      if (!ok) setReplyingTo(replied);
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

  const explain = (m: ChatMessage) =>
    deliveryExplanation(m, {
      name: title,
      now: Date.now(),
      isGroup,
      ...(isGroup ? groupNames(m.id) : {}),
    });
  const groupNames = (messageId: string) => {
    const pending = dbGroupDeliveries(messageId).filter(d => !d.delivered);
    return {
      waitingNames: pending.filter(d => !d.expired).map(d => displayName(d.memberId)),
      missedNames: pending.filter(d => d.expired).map(d => displayName(d.memberId)),
    };
  };

  const info = (m: ChatMessage) => {
    const routeLine = routeText(m.route, m.isOutbound, selfId, id => displayName(id));
    const viaText = routeLine ? `\n\n${routeLine}` : '';
    const waiting = explain(m);
    let text: string;
    if (waiting) text = `${m.status === 'failed' ? 'Not delivered. ' : ''}${waiting}${viaText}`;
    else if (!m.isOutbound) text = `Received at ${formatClock(m.createdAt)}.${viaText}`;
    else
      text = m.recipientCount
        ? `Delivered to ${m.deliveredCount} of ${m.recipientCount}.`
        : `Delivered.${viaText}`;
    Alert.alert('Message info', text);
  };

  const statusInfo = (m: ChatMessage) => {
    const text = explain(m);
    const delivered = m.recipientCount ? `Delivered to ${m.deliveredCount} of ${m.recipientCount}.` : 'Delivered.';
    Alert.alert(statusLabel(m.status), text ?? delivered);
  };

  const copyMessage = (text: string) => {
    if (typeof AetherisBridge.copyText !== 'function') {
      setError("Couldn't copy");
      return;
    }
    AetherisBridge.copyText(text).then(
      () => {
        // Android 13+ shows its own clipboard confirmation.
        if (Number(Platform.Version) >= 33) return;
        setNotice('Copied');
        AccessibilityInfo.announceForAccessibility('Copied');
      },
      () => setError("Couldn't copy"),
    );
  };

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 2000);
    return () => clearTimeout(id);
  }, [notice]);

  const react = (m: ChatMessage, emoji: string) =>
    sendReaction(conversationId, m.refId, emoji).catch(e => setError(String(e?.message ?? e)));

  const reactionRow = (m: ChatMessage) => {
    const mine = reactionsByRef?.[m.refId]?.find(r => r.reactorId === selfId)?.emoji;
    return (
      <View style={styles.reactionRow}>
        {REACTIONS.map(emoji => {
          const selected = mine === emoji;
          return (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`React with ${REACTION_NAMES[emoji]}`}
              accessibilityState={{selected}}
              onPress={() => {
                setMenuFor(null);
                react(m, nextReaction(mine, emoji));
              }}
              style={[styles.reactionBtn, selected && {backgroundColor: t.primarySoft}]}>
              <Text style={styles.reactionEmoji}>{emoji}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const menuActions = (m: ChatMessage): MessageMenuAction[] => {
    const actions: MessageMenuAction[] = [];
    if (m.isOutbound && m.status === 'failed')
      actions.push({
        key: 'retry',
        label: 'Try again',
        icon: 'refresh-outline',
        onPress: () => retryMessage(m.id).catch(e => setError(String(e?.message ?? e))),
      });
    if (!(m.isOutbound && m.status === 'failed'))
      actions.push({
        key: 'reply',
        label: 'Reply',
        icon: 'arrow-undo-outline',
        onPress: () => startReply(m),
      });
    if (m.text)
      actions.push({key: 'copy', label: 'Copy', icon: 'copy-outline', onPress: () => copyMessage(m.text)});
    actions.push({key: 'info', label: 'Info', icon: 'information-circle-outline', onPress: () => info(m)});
    actions.push({
      key: 'delete',
      label: 'Delete',
      icon: 'trash-outline',
      destructive: true,
      onPress: () =>
        Alert.alert('Delete message?', 'It will be removed from this phone.', [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              setReplyingTo(cur => (cur?.id === m.id ? null : cur));
              deleteMessage(m.id);
            },
          },
        ]),
    });
    return actions;
  };

  const recording = recordingSince !== null;

  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: t.chatBg}} behavior={keyboardAvoidingBehavior()}>
      {/* Header */}
      <View style={[styles.header, {paddingTop: insets.top + 8, backgroundColor: t.chatHeader, borderBottomColor: t.separator}]}>
        <IconButton accessibilityLabel="Back" name="arrow-back" size={24} onPress={() => navigation.goBack()} />
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
        <IconButton
          accessibilityLabel={isGroup ? 'Group info' : 'Contact info'}
          name="ellipsis-vertical"
          size={20}
          color={t.textSub}
          onPress={() => navigation.navigate('ContactInfo', {conversationId})}
        />
      </View>

      <View style={styles.listWrap}>
      <Wallpaper />
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={i => i.key}
        contentContainerStyle={styles.list}
        onContentSizeChange={onContentSizeChange}
        onScrollToIndexFailed={onScrollToIndexFailed}
        onScroll={onScroll}
        onScrollBeginDrag={() => (pendingAnchorScroll.current = false)}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View style={[styles.notice, {backgroundColor: t.chatHeader}, t.bubbleShadow && styles.shadow]}>
            <Icon name="lock-closed" size={13} color={t.primaryText} />
            <Text style={[styles.noticeText, {color: t.textSub}]}>
              Messages are end-to-end encrypted. They may hop through other Aetheris phones on the
              way, and those phones can't read them. No internet involved.
            </Text>
          </View>
        }
        renderItem={({item}) =>
          item.type === 'unread' ? (
            <View style={styles.dayWrap}>
              <Text style={[styles.day, {color: t.primaryText, backgroundColor: t.chatHeader}]}>
                {unreadAnchor?.count === 1 ? '1 unread message' : `${unreadAnchor?.count} unread messages`}
              </Text>
            </View>
          ) : item.type === 'day' ? (
            <View style={styles.dayWrap}>
              <Text style={[styles.day, {color: t.textSub, backgroundColor: t.chatHeader}]}>
                {dayLabel(item.ts)}
              </Text>
            </View>
          ) : (
            <Bubble
              m={item.m}
              first={item.first}
              last={item.last}
              showSender={item.showSender}
              highlight={highlightId === item.m.id}
              playing={playingId === item.m.id}
              onPlay={() => play(item.m)}
              onImage={setViewer}
              onLongPress={() => setMenuFor(item.m)}
              onStatus={() => statusInfo(item.m)}
              quote={item.m.replyTo ? resolveQuote(item.m.replyTo, messages, selfId, displayName, ref => dbFindByRef(conversationId, ref)) : null}
              onQuote={onQuote}
              reactions={groupReactions(reactionsByRef?.[item.m.refId] ?? [], selfId)}
              onReact={emoji => react(item.m, emoji)}
              onReply={item.m.isOutbound && item.m.status === 'failed' ? undefined : () => startReply(item.m)}
            />
          )
        }
      />
      {(aboveId || showNew) && (
        <Pressable
          onPress={aboveId ? jumpToAbove : jumpToNew}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={aboveId ? 'New message above, jump to it' : 'Scroll to new messages'}
          style={[styles.newPill, {backgroundColor: t.chatHeader}]}>
          <Icon name={aboveId ? 'arrow-up' : 'arrow-down'} size={14} color={t.primaryText} />
          <Text style={[styles.newPillText, {color: t.text}]}>
            {aboveId ? 'New message above' : 'New messages'}
          </Text>
        </Pressable>
      )}
      </View>

      {!isGroup && !nearby && messages.some(m => m.isOutbound && m.status !== 'delivered' && m.status !== 'failed') && (
        <View style={[styles.away, {backgroundColor: t.chatHeader}]}>
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

      {notice !== '' && (
        <View accessibilityLiveRegion="polite" style={[styles.error, {backgroundColor: t.surfaceAlt}]}>
          <Text style={[styles.errorText, {color: t.textSub}]}>{notice}</Text>
        </View>
      )}

      {/* Composer */}
      {replyingTo && !recording && (
        <View style={[styles.replyBar, {backgroundColor: t.chatHeader}]}>
          <View style={[styles.quoteStripe, {backgroundColor: t.quoteBar}]} />
          <View style={styles.quoteBody}>
            <Text numberOfLines={1} style={[styles.quoteName, {color: t.quoteName}]}>
              {replyingTo.isOutbound ? 'You' : displayName(replyingTo.senderId, replyingTo.senderAlias)}
            </Text>
            <Text numberOfLines={1} style={[styles.quoteText, {color: t.textSub}]}>
              {replySnippet(replyingTo)}
            </Text>
          </View>
          <IconButton accessibilityLabel="Cancel reply" name="close" size={20} color={t.textSub} onPress={() => setReplyingTo(null)} />
        </View>
      )}

      <View style={[styles.composer, {backgroundColor: t.chatBg, paddingBottom: 10 + (keyboardVisible ? 0 : insets.bottom)}]}>
        {recording ? (
          <>
            <IconButton accessibilityLabel="Discard recording" name="trash-outline" color={t.danger} onPress={cancelRecording} />
            <View style={[styles.recording, {backgroundColor: t.chatHeader}]}>
              <View style={[styles.recDot, {backgroundColor: t.danger}]} />
              <Text style={[styles.recText, {color: t.text}]}>{duration(elapsed)}</Text>
              <Text style={[styles.recHint, {color: t.textMuted}]}>Recording…</Text>
            </View>
            <IconButton accessibilityLabel="Send voice message" name="send" size={20} filled onPress={finishRecording} style={styles.sendButton} />
          </>
        ) : (
          <>
            <View style={[styles.inputWrap, {backgroundColor: t.isDark ? t.surface : t.chatHeader}, t.bubbleShadow && styles.shadow]}>
              <TextInput
                ref={inputRef}
                style={[styles.input, {color: t.text}]}
                placeholder="Message"
                placeholderTextColor={t.textMuted}
                value={input}
                onChangeText={changeInput}
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

      <MessageMenu
        visible={menuFor !== null}
        onClose={() => setMenuFor(null)}
        actions={menuFor ? menuActions(menuFor) : []}
        header={menuFor && !(menuFor.isOutbound && menuFor.status === 'failed') ? reactionRow(menuFor) : undefined}
        preview={menuFor ? menuFor.text || (menuFor.kind === 'image' ? 'Photo' : menuFor.kind === 'audio' ? 'Voice message' : undefined) : undefined}
      />
      <Modal visible={viewer !== null} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)} accessible={false}>
          {viewer && (
            <Image source={{uri: viewer}} style={styles.viewerImage} resizeMode="contain" accessibilityLabel="Photo" />
          )}
        </Pressable>
        {/* Tapping the photo also closes it, but that isn't discoverable, and TalkBack needs a button. */}
        <IconButton
          accessibilityLabel="Close photo"
          name="close"
          size={28}
          color="#FFFFFF"
          onPress={() => setViewer(null)}
          style={{...styles.viewerClose, top: insets.top + 8}}
        />
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {flexDirection: 'row', alignItems: 'center', paddingBottom: 8, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 2},
  headerWho: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11},
  headerName: {fontFamily: Font.bold, fontSize: 16.5},
  headerSub: {fontFamily: Font.medium, fontSize: 12.5, marginTop: 1},
  listWrap: {flex: 1},
  newPill: {position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, shadowColor: '#0F1419', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: {width: 0, height: 2}, elevation: 4},
  newPillText: {fontFamily: Font.semiBold, fontSize: 13},
  list: {paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, flexGrow: 1},
  notice: {flexDirection: 'row', gap: 8, alignSelf: 'center', maxWidth: 320, padding: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 12, alignItems: 'flex-start'},
  noticeText: {flex: 1, fontFamily: Font.regular, fontSize: 12, lineHeight: 17, textAlign: 'center'},
  dayWrap: {alignItems: 'center', marginVertical: 10},
  day: {fontFamily: Font.semiBold, fontSize: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9, overflow: 'hidden'},
  row: {flexDirection: 'row', marginVertical: 1.5},
  rowOut: {justifyContent: 'flex-end', paddingLeft: 56, paddingRight: 6},
  rowIn: {justifyContent: 'flex-start', paddingRight: 56, paddingLeft: 6},
  stack: {maxWidth: '100%'},
  stackOut: {alignItems: 'flex-end'},
  stackIn: {alignItems: 'flex-start'},
  chips: {flexDirection: 'row', gap: 6, marginTop: 2, paddingHorizontal: 8},
  chipsOut: {justifyContent: 'flex-end'},
  chipsIn: {justifyContent: 'flex-start'},
  chip: {minHeight: 32, minWidth: 40, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  chipText: {fontSize: 13},
  reactionRow: {flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingVertical: 6},
  reactionBtn: {width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center'},
  reactionEmoji: {fontSize: 26},
  bubble: {paddingHorizontal: 12, paddingTop: 8, paddingBottom: 7, maxWidth: '100%'},
  shadow: {shadowColor: '#0B141A', shadowOpacity: 0.08, shadowRadius: 1.5, shadowOffset: {width: 0, height: 1}, elevation: 1},
  tail: {position: 'absolute', top: 0, width: 0, height: 0, borderTopWidth: 12},
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
  lateText: {flexShrink: 1},
  audio: {flexDirection: 'row', alignItems: 'center', gap: 10, width: 230, paddingBottom: 14},
  playButton: {width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center'},
  wave: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 28},
  waveBar: {flex: 1, borderRadius: 2},
  audioTime: {position: 'absolute', left: 48, bottom: -2, fontFamily: Font.medium, fontSize: 11},
  quote: {flexDirection: 'row', borderRadius: 8, overflow: 'hidden', marginBottom: 5},
  quoteOnImage: {margin: 6, marginTop: 6},
  quoteStripe: {width: 3},
  quoteBody: {flex: 1, paddingHorizontal: 8, paddingVertical: 4},
  quoteName: {fontFamily: Font.semiBold, fontSize: 12.5},
  quoteText: {fontFamily: Font.regular, fontSize: 13, lineHeight: 17},
  replyBar: {flexDirection: 'row', alignItems: 'center', marginHorizontal: 10, marginTop: 6, borderRadius: 14, overflow: 'hidden', paddingRight: 4},
  away: {flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 12},
  awayText: {flex: 1, fontFamily: Font.regular, fontSize: 12.5, lineHeight: 17},
  error: {flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 12},
  errorText: {flex: 1, fontFamily: Font.medium, fontSize: 13},
  composer: {flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 8},
  inputWrap: {flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 24, minHeight: 48},
  input: {flex: 1, maxHeight: 130, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 13, fontFamily: Font.regular, fontSize: 16},
  inlineIcon: {width: 44, height: 48},
  sendButton: {width: 48, height: 48, borderRadius: 24},
  recording: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: 24, paddingHorizontal: 18},
  recDot: {width: 10, height: 10, borderRadius: 5},
  recText: {fontFamily: Font.semiBold, fontSize: 15},
  recHint: {fontFamily: Font.regular, fontSize: 14},
  viewer: {flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center'},
  viewerImage: {width: '100%', height: '100%'},
  viewerClose: {position: 'absolute', right: 12, backgroundColor: 'rgba(0,0,0,0.4)'},
});
