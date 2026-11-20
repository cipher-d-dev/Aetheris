import React from 'react';
import {Image} from 'react-native';
import logo from '../assets/logo.png';

/** The Aetheris app mark (rounded square). */
export default function Logo({size = 48}: {size?: number}) {
  const source = typeof logo === 'string' ? {uri: logo} : logo;
  return <Image source={source} style={{width: size, height: size}} accessibilityLabel="Aetheris" />;
}
