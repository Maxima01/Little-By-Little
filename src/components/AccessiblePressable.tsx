import { Platform, Pressable, type PressableProps } from 'react-native';

// Feature: bridge native accessibility states to explicit ARIA because RN Web omits accessibilityState.
export default function AccessiblePressable({ accessibilityState, accessibilityRole = 'button', ...props }: PressableProps) {
  const webState = Platform.OS === 'web' ? {
    'aria-busy': accessibilityState?.busy,
    'aria-checked': accessibilityState?.checked,
    'aria-expanded': accessibilityState?.expanded,
    'aria-pressed': accessibilityRole === 'button' ? accessibilityState?.selected : undefined,
    'aria-selected': accessibilityRole !== 'button' ? accessibilityState?.selected : undefined,
  } : {};
  return <Pressable {...props} accessibilityRole={accessibilityRole} accessibilityState={accessibilityState} {...webState} />;
}
