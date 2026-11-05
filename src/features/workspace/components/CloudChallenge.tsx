import { Text } from 'react-native';
import { cloudChallengeRequired } from '../lib/cloudChallenge';

export type CloudChallengeProps = { onToken: (token: string) => void; resetKey: number; color?: string };

// Feature: native builds explain unsupported account verification while guest writing remains available.
export default function CloudChallenge({ color = '#625C6B' }: CloudChallengeProps) {
  if (!cloudChallengeRequired) return null;
  return <Text accessibilityRole="alert" style={{ color, fontSize: 14, lineHeight: 21 }}>
    This account requires browser verification. Sign in from the website in a supported browser. You can keep writing and saving on this device.
  </Text>;
}
