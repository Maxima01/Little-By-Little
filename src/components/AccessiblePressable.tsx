import { Platform, Pressable, type PressableProps } from 'react-native';

// Feature: bridge native accessibility states to explicit ARIA because RN Web omits accessibilityState.
export default function AccessiblePressable({ accessibilityState, accessibilityRole = 'button', style, disabled, ...props }: PressableProps) {
  const webState = Platform.OS === 'web' ? {
    'aria-busy': accessibilityState?.busy,
    'aria-checked': accessibilityState?.checked,
    'aria-expanded': accessibilityState?.expanded,
    'aria-pressed': accessibilityRole === 'button' ? accessibilityState?.selected : undefined,
    'aria-selected': accessibilityRole !== 'button' ? accessibilityState?.selected : undefined,
  } : {};
  // Feature: shared pressed and disabled feedback makes every workspace action respond consistently.
  return <Pressable {...props} disabled={disabled} accessibilityRole={accessibilityRole} accessibilityState={accessibilityState} {...webState} style={(state) => [typeof style === 'function' ? style(state) : style, disabled ? { opacity: 0.45 } : state.pressed ? { opacity: 0.75 } : undefined]} />;
}
