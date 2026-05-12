import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Clipboard,
  Modal,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {useIdentityStore} from '../store/identityStore';
import {useThemeStore, Font} from '../theme';

// ─── Custom Alert ─────────────────────────────────────────────────────────────

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
  type?: 'success' | 'error' | 'info';
}

function CustomAlert({
  visible,
  title,
  message,
  onClose,
  type = 'success',
}: CustomAlertProps) {
  const {theme: t} = useThemeStore();

  const iconMap = {
    success: {name: 'check-circle', color: t.successText},
    error: {name: 'alert-triangle', color: t.errorText},
    info: {name: 'info', color: t.accent},
  };
  const bgMap = {
    success: t.successBg,
    error: t.errorBg,
    info: t.accentSoft,
  };
  const {name, color} = iconMap[type];

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}>
      <Pressable
        style={[styles.alertOverlay, {backgroundColor: t.overlay}]}
        onPress={onClose}>
        <Pressable
          style={[
            styles.alertBox,
            {backgroundColor: t.modalBg, borderColor: t.border},
          ]}
          onPress={() => {}}>
          <View style={[styles.alertIconWrap, {backgroundColor: bgMap[type]}]}>
            <Icon name={name} size={26} color={color} />
          </View>
          <Text style={[styles.alertTitle, {color: t.text}]}>{title}</Text>
          <Text style={[styles.alertMessage, {color: t.textSub}]}>
            {message}
          </Text>
          <TouchableOpacity
            style={[styles.alertButton, {backgroundColor: t.accent}]}
            onPress={onClose}
            activeOpacity={0.8}>
            <Text style={styles.alertButtonText}>Got it</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function IdentityScreen() {
  const {identity, isLoading, error, initialize} = useIdentityStore();
  const {theme: t} = useThemeStore();

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    type: 'success' as 'success' | 'error' | 'info',
  });

  useEffect(() => {
    initialize();
  }, []);

  const showAlert = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info' = 'success',
  ) => {
    setAlertConfig({title, message, type});
    setAlertVisible(true);
  };

  const copyId = () => {
    if (!identity) return;
    Clipboard.setString(identity.publicKeyBase58);
    showAlert(
      'Copied!',
      'Your public key has been copied to clipboard.',
      'success',
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.center, {backgroundColor: t.bg}]}>
        <ActivityIndicator size="large" color={t.accent} />
        <Text style={[styles.loadingText, {color: t.textMuted}]}>
          Setting up your identity...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, {backgroundColor: t.bg}]}>
        <View
          style={[
            styles.errorBox,
            {backgroundColor: t.errorBg, borderColor: t.errorBorder},
          ]}>
          <View
            style={[styles.errorIconWrap, {backgroundColor: t.errorBorder}]}>
            <Icon name="alert-triangle" size={28} color={t.errorText} />
          </View>
          <Text style={[styles.errorTitle, {color: t.errorText}]}>
            Something went wrong
          </Text>
          <Text style={[styles.errorMessage, {color: t.errorSub}]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, {borderColor: t.errorText}]}
            onPress={initialize}>
            <Icon name="refresh-cw" size={13} color={t.errorText} />
            <Text style={[styles.retryText, {color: t.errorText}]}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, {backgroundColor: t.bg}]}>
      <CustomAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertVisible(false)}
      />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, {color: t.text}]}>Identity</Text>
        <Text style={[styles.headerSub, {color: t.textMuted}]}>
          Your node on the mesh
        </Text>
      </View>

      {/* ID Card */}
      <View
        style={[
          styles.card,
          {backgroundColor: t.surface, borderColor: t.border},
        ]}>
        <Text style={[styles.cardLabel, {color: t.textMuted}]}>NODE ID</Text>

        <View
          style={[
            styles.idBox,
            {backgroundColor: t.accentSoft, borderColor: t.accentBorder},
          ]}>
          <Text style={[styles.shortId, {color: t.accent}]}>
            {identity?.shortId}
          </Text>
        </View>

        <Text style={[styles.idHint, {color: t.textSub}]}>
          Share this ID so others can find and message you on the mesh
        </Text>

        <TouchableOpacity
          style={[
            styles.copyButton,
            {backgroundColor: t.accentSoft, borderColor: t.accentBorder},
          ]}
          onPress={copyId}
          activeOpacity={0.7}>
          <Icon name="copy" size={14} color={t.accent} />
          <Text style={[styles.copyButtonText, {color: t.accent}]}>
            Copy Full Public Key
          </Text>
        </TouchableOpacity>
      </View>

      {/* Status pills */}
      <View style={styles.pillRow}>
        {[
          {label: 'Encrypted', icon: 'lock'},
          {label: 'No Servers', icon: 'wifi-off'},
          {label: 'Offline-First', icon: 'radio'},
        ].map(({label, icon}) => (
          <View
            key={label}
            style={[
              styles.pill,
              {backgroundColor: t.surfaceAlt, borderColor: t.border},
            ]}>
            <Icon name={icon} size={10} color={t.textSub} />
            <Text style={[styles.pillText, {color: t.textSub}]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Debug */}
      <View
        style={[
          styles.debugCard,
          {backgroundColor: t.surfaceAlt, borderColor: t.border},
        ]}>
        <Text style={[styles.debugLabel, {color: t.textMuted}]}>
          PUBLIC KEY
        </Text>
        <Text
          style={[styles.debugKey, {color: t.textMuted}]}
          numberOfLines={2}
          ellipsizeMode="middle">
          {identity?.publicKeyBase58}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  loadingText: {
    marginTop: 16,
    fontSize: 14,
    fontFamily: Font.regular,
  },

  // Error
  errorBox: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '100%',
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorTitle: {fontSize: 16, fontFamily: Font.bold, marginBottom: 6},
  errorMessage: {
    fontSize: 13,
    fontFamily: Font.regular,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  retryText: {fontSize: 13, fontFamily: Font.semiBold},

  // Header
  header: {marginBottom: 28},
  headerTitle: {
    fontSize: 28,
    fontFamily: Font.bold,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSub: {fontSize: 14, fontFamily: Font.regular},

  // Card
  card: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardLabel: {
    fontSize: 10,
    fontFamily: Font.bold,
    letterSpacing: 2,
    marginBottom: 14,
  },
  idBox: {
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 12,
  },
  shortId: {
    fontSize: 30,
    fontFamily: Font.extraBold,
    letterSpacing: 8,
  },
  idHint: {
    fontSize: 13,
    fontFamily: Font.regular,
    lineHeight: 19,
    marginBottom: 18,
    textAlign: 'center',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
  },
  copyButtonText: {fontSize: 14, fontFamily: Font.semiBold, letterSpacing: 0.1},

  // Pills
  pillRow: {flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap'},
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: {fontSize: 11, fontFamily: Font.medium},

  // Debug
  debugCard: {borderRadius: 14, padding: 14, borderWidth: 1},
  debugLabel: {
    fontSize: 9,
    fontFamily: Font.bold,
    letterSpacing: 2,
    marginBottom: 6,
  },
  debugKey: {fontSize: 11, fontFamily: Font.regular, lineHeight: 16},

  // Alert
  alertOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  alertBox: {
    width: '100%',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  alertIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 17,
    fontFamily: Font.bold,
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  alertMessage: {
    fontSize: 14,
    fontFamily: Font.regular,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  alertButton: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  alertButtonText: {color: '#FFFFFF', fontSize: 15, fontFamily: Font.bold},
});
