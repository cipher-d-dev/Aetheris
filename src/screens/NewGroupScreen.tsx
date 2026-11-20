import React, {useState} from 'react';
import {View, Text, TextInput, StyleSheet, FlatList} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Font, Type, useThemeStore} from '../theme';
import {useMeshService} from '../store/meshService';
import IconButton from '../ui/IconButton';
import Button from '../ui/Button';
import {Icon} from '../ui/Icon';
import {PersonRow, Searching, usePeople} from './PeopleScreen';

/**
 * Each group message is encrypted separately for every member and carries the
 * group's name and members, so people learn about the group from the first
 * message. No server, no shared key.
 */
export default function NewGroupScreen() {
  const {theme: t} = useThemeStore();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const createGroup = useMeshService(s => s.createGroup);
  const people = usePeople();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const canCreate = name.trim().length > 0 && selected.length > 0;

  return (
    <View style={[styles.container, {backgroundColor: t.bg}]}>
      <View style={[styles.header, {paddingTop: insets.top + 8}]}>
        <IconButton accessibilityLabel="Back" name="arrow-back" size={24} onPress={() => navigation.goBack()} />
        <Text style={[Type.title, {color: t.text, flex: 1}]}>New group</Text>
      </View>

      <View style={[styles.nameBox, {backgroundColor: t.surface}]}>
        <View style={[styles.groupIcon, {backgroundColor: t.primarySoft}]}>
          <Icon name="people" size={22} color={t.primary} />
        </View>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Group name"
          placeholderTextColor={t.textMuted}
          maxLength={64}
          style={[styles.nameInput, {color: t.text}]}
        />
      </View>

      <Text style={[styles.section, {color: t.textMuted}]}>
        {selected.length ? `${selected.length} selected` : 'Add people'}
      </Text>

      {people.length === 0 ? (
        <Searching title="No one nearby yet" subtitle="People you can add will show up here." />
      ) : (
        <FlatList
          data={people}
          keyExtractor={p => p.id}
          contentContainerStyle={{paddingBottom: 120 + insets.bottom}}
          renderItem={({item}) => {
            const on = selected.includes(item.id);
            return (
              <PersonRow
                person={item}
                onPress={() => toggle(item.id)}
                accessibilityRole="checkbox"
                accessibilityState={{checked: on}}
                right={
                  <Icon
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={26}
                    color={on ? t.primary : t.textMuted}
                  />
                }
              />
            );
          }}
        />
      )}

      <View style={[styles.footer, {paddingBottom: 24 + insets.bottom, backgroundColor: t.bg}]}>
        <Button
          title="Create group"
          disabled={!canCreate}
          onPress={() => navigation.replace('Chat', {conversationId: createGroup(name, selected)})}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingBottom: 8},
  nameBox: {flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, padding: 10, borderRadius: 18},
  groupIcon: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center'},
  nameInput: {flex: 1, fontFamily: Font.semiBold, fontSize: 17, paddingVertical: 8},
  section: {fontFamily: Font.semiBold, fontSize: 13, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 6},
  footer: {position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16},
});
