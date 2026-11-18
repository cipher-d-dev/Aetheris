import React, {useEffect, useState} from 'react';
import {Modal, View, Text, StyleSheet, TouchableOpacity, FlatList, Share} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {useThemeStore, Font} from '../theme';
import {useMeshService} from '../store/meshService';
import {displayName} from '../store/messagesStore';
import {clearLog, formatLogTime, getLogLines, LogLine, subscribeLog} from '../utils/logBuffer';

/** Live mesh state + event log, exportable for field testing. */
export default function DiagnosticsModal({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const {theme: t} = useThemeStore();
  const mesh = useMeshService();
  const [lines, setLines] = useState<LogLine[]>(getLogLines());

  useEffect(() => {
    if (!visible) return;
    setLines(getLogLines());
    return subscribeLog(() => setLines(getLogLines()));
  }, [visible]);

  const report = () => {
    const header = [
      `Aetheris diagnostics ${new Date().toISOString()}`,
      `node ${mesh.selfId?.slice(0, 12) ?? '?'} status=${mesh.status} power=${mesh.powerMode}`,
      `nearby=${mesh.nearbyCount} linked=${mesh.neighbours.length} reachable=${mesh.routes.length} carrying=${mesh.carrying}`,
      'routes:',
      ...mesh.routes.map(r => `  ${r.id.slice(0, 12)} hops=${r.hops} via=${r.nextHop.slice(0, 12)}`),
      'log:',
    ];
    return [...header, ...lines.map(l => `${formatLogTime(l.t)} ${l.msg}`)].join('\n');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, {backgroundColor: t.bg}]}>
        <View style={styles.header}>
          <Text style={[styles.title, {color: t.text}]}>Diagnostics</Text>
          <TouchableOpacity onPress={() => Share.share({message: report()}).catch(() => undefined)}>
            <Icon name="share" size={20} color={t.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={clearLog}>
            <Icon name="trash-2" size={20} color={t.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Icon name="x" size={22} color={t.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, {backgroundColor: t.surface, borderColor: t.border}]}>
          <Text style={[styles.mono, {color: t.textSub}]}>
            status {mesh.status} · {mesh.powerMode} · nearby {mesh.nearbyCount} · linked{' '}
            {mesh.neighbours.length} · carrying {mesh.carrying}
          </Text>
          {mesh.routes.length === 0 ? (
            <Text style={[styles.mono, {color: t.textMuted}]}>no routes</Text>
          ) : (
            mesh.routes.map(r => (
              <Text key={r.id} style={[styles.mono, {color: t.text}]} numberOfLines={1}>
                {displayName(r.id, r.alias)} · {r.hops} hop{r.hops === 1 ? '' : 's'}
                {r.hops > 1 ? ` via ${displayName(r.nextHop)}` : ''}
              </Text>
            ))
          )}
        </View>

        <FlatList
          data={[...lines].reverse()}
          keyExtractor={(l, i) => `${l.t}-${i}`}
          contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 30}}
          ListEmptyComponent={<Text style={[styles.mono, {color: t.textMuted}]}>No events yet.</Text>}
          renderItem={({item}) => (
            <Text style={[styles.mono, {color: t.textSub}]}>
              <Text style={{color: t.textMuted}}>{formatLogTime(item.t)} </Text>
              {item.msg}
            </Text>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, paddingTop: 40},
  header: {flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 16, paddingBottom: 12},
  title: {flex: 1, fontSize: 22, fontFamily: Font.bold},
  card: {marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderRadius: 12, padding: 12, gap: 4},
  mono: {fontFamily: 'monospace', fontSize: 11, lineHeight: 16},
});
