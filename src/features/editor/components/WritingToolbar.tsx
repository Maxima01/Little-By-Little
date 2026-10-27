import Pressable from '../../../components/AccessiblePressable';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../../../theme/theme';
import type { WritingAlignment, WritingBlockStyle, WritingFontFamily } from '../../../domain/model';

type MenuName = 'style' | 'font' | 'size';
export type ToolbarAction = 'bold' | 'italic' | 'underline' | 'strike' | 'bullet' | 'numbered' | 'undo' | 'redo';

type Props = {
  theme: Theme;
  desktop: boolean;
  blockStyle: WritingBlockStyle;
  fontFamily: WritingFontFamily;
  fontSize: number;
  alignment: WritingAlignment;
  activeFormats?: Partial<Record<ToolbarAction, boolean>>;
  enableHistory?: boolean;
  onBlockStyleChange: (value: WritingBlockStyle) => void;
  onFontFamilyChange: (value: WritingFontFamily) => void;
  onFontSizeChange: (value: number) => void;
  onAlignmentChange: (value: WritingAlignment) => void;
  onFormat: (action: ToolbarAction) => void;
};

const menuOptions: Record<MenuName, { label: string; value: string }[]> = {
  style: [
    { label: 'Paragraph', value: 'Paragraph' },
    { label: 'Heading 1', value: 'Heading 1' },
    { label: 'Heading 2', value: 'Heading 2' },
    { label: 'Heading 3', value: 'Heading 3' },
    { label: 'Block quote', value: 'Quote' },
  ],
  font: [
    { label: 'Georgia · Literary', value: 'Georgia' },
    { label: 'Arial · Clean', value: 'Arial' },
    { label: 'Courier New · Typewriter', value: 'Courier New' },
  ],
  size: [14, 16, 18, 20, 24].map((size) => ({ label: String(size), value: String(size) })),
};

// Gives writers one compact place to set type choices and reach common formatting actions.
export default function WritingToolbar({
  theme, desktop, blockStyle, fontFamily, fontSize, alignment, activeFormats = {},
  enableHistory = false, onBlockStyleChange, onFontFamilyChange, onFontSizeChange,
  onAlignmentChange, onFormat,
}: Props) {
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  // Feature: explain horizontal overflow only when formatting controls exceed the available width.
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const styles = makeStyles(theme, desktop);
  const currentValues: Record<MenuName, string> = {
    style: blockStyle,
    font: fontFamily,
    size: String(fontSize),
  };
  const menuTitles: Record<MenuName, string> = {
    style: 'Text style',
    font: 'Font family',
    size: 'Font size',
  };

  const selectOption = (value: string) => {
    if (openMenu === 'style') onBlockStyleChange(value as WritingBlockStyle);
    if (openMenu === 'font') onFontFamilyChange(value as WritingFontFamily);
    if (openMenu === 'size') onFontSizeChange(Number(value));
    setOpenMenu(null);
  };

  const actionButtons: { action: ToolbarAction; label: string; name: string; textStyle?: object }[] = [
    { action: 'bold', label: 'B', name: 'Bold', textStyle: { fontWeight: '800' } },
    { action: 'italic', label: 'I', name: 'Italic', textStyle: { fontStyle: 'italic' } },
    { action: 'underline', label: 'U', name: 'Underline', textStyle: { textDecorationLine: 'underline' } },
    { action: 'strike', label: 'S̶', name: 'Strikethrough' },
    { action: 'bullet', label: '• List', name: 'Bulleted list' },
    { action: 'numbered', label: '1. List', name: 'Numbered list' },
    ...(enableHistory ? [
      { action: 'undo' as const, label: '↶', name: 'Undo' },
      { action: 'redo' as const, label: '↷', name: 'Redo' },
    ] : []),
  ];

  return (
    <>
      <View style={styles.toolbarFrame}>
      <ScrollView horizontal showsHorizontalScrollIndicator keyboardShouldPersistTaps="always" onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)} onContentSizeChange={(width) => setContentWidth(width)} style={[styles.toolbarScroll, { height: contentWidth > viewportWidth + 1 ? 80 : 66 }]} contentContainerStyle={styles.toolbar}>
        <View style={styles.toolGroup}>
          <PickerButton label="Text style" value={blockStyle} onPress={() => setOpenMenu('style')} styles={styles} />
          <PickerButton label="Font" value={fontFamily} onPress={() => setOpenMenu('font')} styles={styles} />
          <Pressable accessibilityRole="button" accessibilityLabel="Decrease font size" onPress={() => onFontSizeChange(Math.max(10, fontSize - 2))} style={styles.sizeStep}><Text style={styles.sizeStepText}>A−</Text></Pressable>
          <PickerButton label="Font size" value={String(fontSize)} onPress={() => setOpenMenu('size')} styles={styles} compact />
          <Pressable accessibilityRole="button" accessibilityLabel="Increase font size" onPress={() => onFontSizeChange(Math.min(48, fontSize + 2))} style={styles.sizeStep}><Text style={styles.sizeStepText}>A+</Text></Pressable>
        </View>
        <View style={styles.groupDivider} />
        <View style={styles.toolGroup}>
          {actionButtons.filter(({ action }) => ['bold', 'italic', 'underline', 'strike'].includes(action)).map(({ action, label, name, textStyle }) => (
            <Pressable key={action} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: !!activeFormats[action] }} onPress={() => onFormat(action)} style={[styles.toolButton, activeFormats[action] && styles.toolButtonActive]}>
              <Text style={[styles.toolText, textStyle, activeFormats[action] && styles.toolTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.groupDivider} />
        <View style={styles.toolGroup}>
          {(['left', 'center', 'right', 'justify'] as WritingAlignment[]).map((value) => (
            <Pressable key={value} accessibilityRole="button" accessibilityLabel={'Align ' + value} accessibilityState={{ selected: alignment === value }} onPress={() => onAlignmentChange(value)} style={[styles.toolButton, alignment === value && styles.toolButtonActive]}>
              <AlignmentIcon alignment={value} active={alignment === value} styles={styles} />
            </Pressable>
          ))}
          {actionButtons.filter(({ action }) => ['bullet', 'numbered'].includes(action)).map(({ action, label, name }) => (
            <Pressable key={action} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: !!activeFormats[action] }} onPress={() => onFormat(action)} style={[styles.listButton, activeFormats[action] && styles.toolButtonActive]}>
              <Text style={[styles.toolText, activeFormats[action] && styles.toolTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {enableHistory && <>
          <View style={styles.groupDivider} />
          <View style={styles.toolGroup}>{actionButtons.filter(({ action }) => action === 'undo' || action === 'redo').map(({ action, label, name }) => (
            <Pressable key={action} accessibilityRole="button" accessibilityLabel={name} onPress={() => onFormat(action)} style={styles.toolButton}><Text style={styles.historyText}>{label}</Text></Pressable>
          ))}</View>
        </>}
      </ScrollView>
      {contentWidth > viewportWidth + 1 && <Text style={styles.scrollHint}>Scroll horizontally for more controls ↔</Text>}
      </View>
      <Modal accessibilityLabel={openMenu ? menuTitles[openMenu] : "Formatting options"} transparent visible={openMenu !== null} animationType="fade" onRequestClose={() => setOpenMenu(null)}>
        <View style={styles.menuBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close formatting menu" onPress={() => setOpenMenu(null)} style={styles.menuDismiss} />
          <View accessibilityViewIsModal style={styles.menuPanel}>
            <Text style={styles.menuTitle}>{openMenu ? menuTitles[openMenu] : ''}</Text>
            <ScrollView>
              {(openMenu ? menuOptions[openMenu] : []).map((option) => {
                const selected = option.value.toLowerCase() === currentValues[openMenu!].toLowerCase();
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => selectOption(option.value)}
                    style={[styles.menuOption, selected && styles.menuOptionSelected]}
                  >
                    <Text style={[styles.menuOptionText, selected && styles.menuOptionTextSelected]}>{option.label}</Text>
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function PickerButton({ label, value, onPress, styles, compact = false }: {
  label: string; value: string; onPress: () => void; styles: ReturnType<typeof makeStyles>; compact?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label + ': ' + value} onPress={onPress} style={[styles.pickerButton, compact && styles.pickerButtonCompact]}>
      <Text numberOfLines={1} style={styles.pickerLabel}>{value}</Text>
      <Text style={styles.pickerChevron}>⌄</Text>
    </Pressable>
  );
}

// Draws the familiar paragraph alignment glyph without relying on a platform icon font.
function AlignmentIcon({ alignment, active, styles }: { alignment: WritingAlignment; active: boolean; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.alignmentIcon}>{[0, 1, 2].map((line) => <View key={line} style={[styles.alignmentLine, alignment === 'justify' ? styles.alignmentLineJustified : { width: line === 1 ? 12 : 15, alignSelf: alignment === 'left' ? 'flex-start' : alignment === 'right' ? 'flex-end' : 'center' }, active && styles.alignmentLineActive]} />)}</View>;
}

function makeStyles(theme: Theme, desktop: boolean) {
  return StyleSheet.create({
    toolbarFrame: { flexShrink: 0, width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: desktop ? 26 : 12, marginTop: 0 },
    // Feature: compact formatting expands only when a horizontal scrollbar needs room beneath the 44px controls.
    toolbarScroll: { flexShrink: 0, minHeight: 66, borderWidth: 1, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.surface },
    toolbar: { minHeight: 64, paddingVertical: 8, gap: desktop ? 8 : 6, paddingHorizontal: desktop ? 14 : 9, alignItems: 'center' },
    scrollHint: { fontSize: 12, lineHeight: 18, color: theme.muted, paddingTop: 4 },
    toolGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    pickerButton: { height: 44, maxWidth: 180, minWidth: 58, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 9, backgroundColor: theme.background, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
    pickerButtonCompact: { minWidth: 54, width: 58 },
    pickerLabel: { color: theme.text, fontSize: 14, fontWeight: '600', maxWidth: 140 },
    pickerChevron: { color: theme.muted, fontSize: 14, fontWeight: '700' },
    sizeStep: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
    sizeStepText: { color: theme.text, fontSize: 14, fontWeight: '700' },
    groupDivider: { width: 1, height: 30, backgroundColor: theme.border },
    toolButton: { width: 44, height: 44, paddingHorizontal: 6, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    listButton: { minWidth: 54, height: 44, paddingHorizontal: 7, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    toolButtonActive: { backgroundColor: theme.accentSoft },
    toolText: { color: theme.text, fontSize: 14, fontWeight: '700' },
    toolTextActive: { color: theme.accent },
    historyText: { color: theme.muted, fontSize: 19 },
    alignmentIcon: { width: 17, height: 16, justifyContent: 'space-between' },
    alignmentLine: { height: 2, borderRadius: 2, backgroundColor: theme.muted },
    alignmentLineJustified: { height: 2, width: 15, borderRadius: 2, alignSelf: 'stretch', backgroundColor: theme.muted },
    alignmentLineActive: { backgroundColor: theme.accent },
    menuBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(18,16,21,0.34)' },
    menuDismiss: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    menuPanel: { width: '100%', maxWidth: 360, maxHeight: '80%', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, shadowColor: '#332F38', shadowOpacity: 0.16, shadowOffset: { width: 0, height: 8 }, shadowRadius: 22, elevation: 8 },
    menuTitle: { color: theme.text, fontSize: 15, fontWeight: '700', marginBottom: 10 },
    menuOption: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    menuOptionSelected: { backgroundColor: theme.accentSoft },
    menuOptionText: { color: theme.text, fontSize: 14 },
    menuOptionTextSelected: { color: theme.accent, fontWeight: '700' },
    checkmark: { color: theme.accent, fontWeight: '700' },
  });
}
