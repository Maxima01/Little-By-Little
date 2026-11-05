import { StyleSheet, View } from 'react-native';

// Feature: a fixed-size drawn chevron keeps native dropdown arrows centered independently of text baselines.
export default function DropdownChevron({ color }: { color: string }) {
  return <View accessible={false} pointerEvents="none" style={styles.frame}><View style={[styles.stroke, { borderColor: color }]} /></View>;
}

const styles = StyleSheet.create({
  frame: { width: 18, height: 18, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  stroke: { width: 7, height: 7, borderRightWidth: 1.75, borderBottomWidth: 1.75, transform: [{ translateY: -2 }, { rotate: '45deg' }] },
});
