import { workspaceGeometry } from '../../../theme/theme';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '../../../components/AccessiblePressable';
import type { Theme } from '../../../theme/theme';

type Props = {
  theme: Theme;
  desktop: boolean;
  title: string;
  storyTitle: string;
  chapterNumber: number;
  focusMode: boolean;
  navigationControl?: ReactNode;
  onTitleChange: (title: string) => void;
  onTitleCommit: () => void;
  onBack: () => void;
  onFocusModeChange: (value: boolean) => void;
  onExport: () => void;
  onPreview: () => void;
};

// Feature: equal measured side rails center chapter details in the whole bar; narrow layouts give them a full row.
export default function WritingHeader({ theme, desktop, title, storyTitle, chapterNumber, focusMode, navigationControl, onTitleChange, onTitleCommit, onBack, onFocusModeChange, onExport, onPreview }: Props) {
  const [width, setWidth] = useState(0);
  const [navigationWidth, setNavigationWidth] = useState(130);
  const [actionsWidth, setActionsWidth] = useState(230);
  const sideWidth = Math.max(navigationWidth, actionsWidth);
  const stacked = width < sideWidth * 2 + 280;
  const styles = makeStyles(theme, desktop);
  const navigation = (
    <View onLayout={(event) => setNavigationWidth(event.nativeEvent.layout.width)} style={styles.navigation}>
      {!focusMode && navigationControl}
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹  Story</Text></Pressable>
    </View>
  );
  const details = (
    <View style={[styles.details, stacked && styles.detailsStacked]}>
      <Text numberOfLines={1} style={styles.breadcrumb}>{storyTitle} / Chapter {chapterNumber}</Text>
      <TextInput value={title} onChangeText={onTitleChange} onBlur={onTitleCommit} style={styles.titleInput} accessibilityLabel="Chapter title" />
    </View>
  );
  const actions = (
    <View onLayout={(event) => setActionsWidth(event.nativeEvent.layout.width)} style={styles.actions}>
      <Pressable accessibilityLabel={focusMode ? 'Exit focus mode' : 'Enter focus mode'} accessibilityState={{ selected: focusMode }} onPress={() => onFocusModeChange(!focusMode)} style={[styles.button, focusMode && { backgroundColor: theme.accentSoft }]}><Text style={styles.buttonText}>{focusMode ? 'Exit focus' : 'Focus'}</Text></Pressable>
      {!focusMode && <Pressable accessibilityLabel="Export manuscript" onPress={onExport} style={styles.button}><Text style={styles.buttonText}>Export</Text></Pressable>}
      <Pressable accessibilityRole="button" onPress={onPreview} style={styles.button}><Text style={styles.buttonText}>Preview</Text></Pressable>
    </View>
  );

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={[styles.topbar, stacked && styles.topbarStacked]}>
      {stacked ? <>{details}<View style={styles.controls}>{navigation}{actions}</View></> : <>
        <View style={[styles.side, { width: sideWidth }]}>{navigation}</View>
        {details}
        <View style={[styles.side, styles.sideEnd, { width: sideWidth }]}>{actions}</View>
      </>}
    </View>
  );
}

// Feature: centered editable headings retain the editor's colors, spacing, and 44px action targets at every width.
function makeStyles(theme: Theme, desktop: boolean) {
  // Feature: quieter surfaces and consistent geometry keep writing actions visible without competing with the manuscript.
  return StyleSheet.create({
    topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 72, flexShrink: 0, paddingHorizontal: desktop ? 24 : 12, backgroundColor: theme.background },
    topbarStacked: { flexDirection: 'column', gap: 8 },
    side: { flexShrink: 0, alignItems: 'flex-start' },
    sideEnd: { alignItems: 'flex-end' },
    navigation: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    backButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 8 },
    backText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    details: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, alignItems: 'center' },
    // Feature: a natural-height title row keeps both chapter lines visible when the header stacks vertically.
    detailsStacked: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minHeight: 40, width: '100%', paddingTop: 2 },
    breadcrumb: { width: '100%', color: theme.muted, fontSize: 12, textAlign: 'center' },
    titleInput: { width: '100%', color: theme.text, fontSize: 15, fontWeight: '700', padding: 0, marginTop: 3, textAlign: 'center' },
    controls: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: workspaceGeometry.controlRadius },
    buttonText: { color: theme.text, fontSize: 14, fontWeight: '500' },
  });
}
