import React, {useMemo, useRef} from 'react';
import {Animated, PanResponder, StyleSheet, View} from 'react-native';
import {useThemeStore} from '../theme';
import {Icon} from './Icon';
import {shouldClaimSwipe, swipeOffset, swipeTriggersReply, SWIPE_TRIGGER_DX} from './swipe';

type Props = {onReply: () => void; children: React.ReactNode};

/** Drag a row to the right to reply. Never claims on start, so taps and long-press still work. */
export default function SwipeToReply({onReply, children}: Props) {
  const t = useThemeStore(s => s.theme);
  const x = useRef(new Animated.Value(0)).current;
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  const pan = useMemo(
    () =>
      PanResponder.create({
        // g.x0 is only filled in once a responder is granted, so it is 0 here;
        // the touch started at moveX - dx.
        onMoveShouldSetPanResponder: (_, g) => shouldClaimSwipe({dx: g.dx, dy: g.dy, x0: g.moveX - g.dx}),
        onPanResponderMove: (_, g) => x.setValue(swipeOffset(g.dx)),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, g) => {
          if (swipeTriggersReply(g.dx)) onReplyRef.current();
          Animated.spring(x, {toValue: 0, useNativeDriver: true}).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(x, {toValue: 0, useNativeDriver: true}).start();
        },
      }),
    [x],
  );

  const iconOpacity = x.interpolate({inputRange: [0, SWIPE_TRIGGER_DX], outputRange: [0, 1], extrapolate: 'clamp'});

  return (
    <View>
      <Animated.View pointerEvents="none" style={[styles.icon, {opacity: iconOpacity}]}>
        <Icon name="arrow-undo" size={22} color={t.textSub} />
      </Animated.View>
      <Animated.View style={{transform: [{translateX: x}]}} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center'},
});
