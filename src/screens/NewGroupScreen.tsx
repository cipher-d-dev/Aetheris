import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, FlatList} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {useNavigation} from '@react-navigation/native';
import {useThemeStore, Font} from '../theme';
import {useMeshService} from '../store/meshService';
import {PersonRow, styles, usePeople} from './NewChatScreen';

/**
 * Groups are local metadata: each group message is encrypted separately for
 * every member and carries the group's name + member list, so members learn
 * about the group from the first message they receive. No server, no shared
 * group key to distribute.
 */
export default function NewGroupScreen() {
  const {theme: t} = useThemeStore();
  const navigation = useNavigation<any>();
  const createGroup = useMeshService(s => s.createGroup);
  const people = usePeople();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const canCreate = name.trim().length > 0 && selected.length > 0;

  const create = () => {
    if (!canCreate) return;
    const conversationId = createGroup(name, selected);
    navigation.replace('Chat', {conversationId});
  };

  return (
    <View style={[styles.container, {backgroundColor: t.bg}]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.back, {backgroundColor: t.surfaceAlt, borderColor: t.border}]}>
          <Icon name="arrow-left" size={18} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.title, {color: t.text, flex: 1}]}>New group</Text>
        <TouchableOpacity onPress={create} disabled={!canCreate}>
          <Text style={{color: canCreate ? t.accent : t.textMuted, fontFamily: Font.bold, fontSize: 15}}>
            Create
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.inputWrap, {backgroundColor: t.surface, borderColor: t.border}]}>
        <TextInput
          style={[styles.input, {color: t.text}]}
          placeholder="Group name"
          placeholderTextColor={t.textMuted}
          value={name}
          onChangeText={setName}
          maxLength={64}
        />
      </View>

      <Text style={[styles.section, {color: t.textMuted}]}>
        MEMBERS {selected.length > 0 ? `(${selected.length} selected)` : ''}
      </Text>
      <FlatList
        data={people}
        keyExtractor={p => p.id}
        contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 40}}
        ListEmptyComponent={
          <Text style={[styles.empty, {color: t.textMuted}]}>
            You can add people once you've seen them on the mesh.
          </Text>
        }
        renderItem={({item}) => (
          <PersonRow
            id={item.id}
            alias={item.alias}
            hops={item.hops}
            selected={selected.includes(item.id)}
            onPress={() => toggle(item.id)}
          />
        )}
      />
    </View>
  );
}
