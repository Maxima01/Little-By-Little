import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Pressable from '../../../components/AccessiblePressable';
import type { Theme } from '../../../theme/theme';
import { LEGAL_DOCUMENTS, LEGAL_OPERATOR, LEGAL_UPDATED_LABEL, type LegalDocumentId } from '../lib/legalPolicies';
import { LEGAL_VERSION, type AccountPolicyAcceptance } from '../lib/policyConsent';

type Props = {
  theme: Theme;
  acceptance?: AccountPolicyAcceptance;
  onChange?: (acceptance: AccountPolicyAcceptance) => void;
  disabled?: boolean;
};

// Feature: the desk offers offline-readable policies and separate, unchecked account acknowledgments without leaving a draft.
export default function AccountPolicies({ theme, acceptance, onChange, disabled = false }: Props) {
  const [reading, setReading] = useState<LegalDocumentId | null>(null);
  const styles = makeStyles(theme);
  const policy = reading ? LEGAL_DOCUMENTS[reading] : null;
  return <View style={styles.root}>
    {acceptance && <Text style={styles.detail}>Your writing stays yours. Cloud sync is optional and sends your entire workspace once connected. We do not sell your writing or use it to train AI.</Text>}
    <View style={styles.links}>
      <Pressable accessibilityRole="button" accessibilityLabel="Read Terms of Service and Conditions" onPress={() => setReading('terms')} style={styles.link}><Text style={styles.linkText}>Terms & conditions</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Read Privacy Notice and Fair Use of Data" onPress={() => setReading('privacy')} style={styles.link}><Text style={styles.linkText}>Privacy & data use</Text></Pressable>
    </View>
    {acceptance && onChange && <View style={styles.choices}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="I am at least 18, can enter into this agreement, and agree to the Terms of Service and Conditions" accessibilityState={{ checked: acceptance.termsAccepted, disabled }} disabled={disabled} onPress={() => onChange({ ...acceptance, termsAccepted: !acceptance.termsAccepted })} style={styles.checkboxRow}>
        <View style={[styles.box, acceptance.termsAccepted && styles.checkedBox]}>{acceptance.termsAccepted && <View style={styles.checkmark} />}</View>
        <Text style={styles.choiceText}>I am at least 18, can enter into this agreement, and agree to the Terms of Service & Conditions.</Text>
      </Pressable>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="I have read and acknowledge the Privacy Notice and Fair Use of Data" accessibilityState={{ checked: acceptance.privacyAcknowledged, disabled }} disabled={disabled} onPress={() => onChange({ ...acceptance, privacyAcknowledged: !acceptance.privacyAcknowledged })} style={styles.checkboxRow}>
        <View style={[styles.box, acceptance.privacyAcknowledged && styles.checkedBox]}>{acceptance.privacyAcknowledged && <View style={styles.checkmark} />}</View>
        <Text style={styles.choiceText}>I have read and acknowledge the Privacy Notice & Fair Use of Data.</Text>
      </Pressable>
      <Text style={styles.detail}>Both choices are required to create an account. Privacy acknowledgment does not give permission for marketing or unrelated data use.</Text>
    </View>}
    {!!policy && <Modal visible transparent animationType="fade" accessibilityLabel={policy.title} onRequestClose={() => setReading(null)}>
      <View style={styles.overlay}><View style={styles.reader}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>{policy.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close policy" onPress={() => setReading(null)} style={styles.close}><Text style={styles.linkText}>Close</Text></Pressable>
        </View>
        <ScrollView key={reading} style={styles.scroll} contentContainerStyle={styles.document}>
          <Text style={styles.detail}>Updated {LEGAL_UPDATED_LABEL} · Version {LEGAL_VERSION}</Text>
          <Text selectable style={styles.summary}>{policy.summary}</Text>
          {policy.sections.map((section) => <View key={section.id} style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>{section.heading}</Text>
            {section.paragraphs.map((paragraph) => <Text selectable key={paragraph} style={styles.paragraph}>{paragraph}</Text>)}
            {section.links?.map((link) => <Text selectable key={link.url} style={styles.reference}>{link.label}: {link.url}</Text>)}
          </View>)}
          <View style={styles.contact}><Text style={styles.heading}>Privacy & support</Text><Text selectable style={styles.paragraph}>{LEGAL_OPERATOR.name}{'\n'}{LEGAL_OPERATOR.email}</Text><Text style={styles.detail}>Use this email for privacy requests, account deletion, or questions about these policies.</Text></View>
        </ScrollView>
      </View></View>
    </Modal>}
  </View>;
}

// Feature: policy reading and consent inherit the current theme, wrap at narrow widths, and preserve readable touch targets.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { gap: 6, width: '100%' },
    links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
    link: { minHeight: 44, justifyContent: 'center' },
    linkText: { color: theme.accent, fontSize: 14, lineHeight: 21, fontWeight: '600', textDecorationLine: 'underline' },
    detail: { color: theme.muted, fontSize: 13, lineHeight: 21 },
    choices: { gap: 10 },
    checkboxRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: 44, paddingVertical: 6 },
    box: { width: 22, height: 22, marginTop: 1, borderWidth: 2, borderColor: theme.accent, borderRadius: 3, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    checkedBox: { backgroundColor: theme.accent },
    checkmark: { width: 7, height: 12, borderRightWidth: 2, borderBottomWidth: 2, borderColor: theme.mode === 'dark' ? '#201B2A' : '#FFFFFF', transform: [{ rotate: '45deg' }], marginTop: -3 },
    choiceText: { color: theme.text, fontSize: 14, lineHeight: 22, flex: 1 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', padding: 12, justifyContent: 'center', alignItems: 'center' },
    reader: { width: '100%', maxWidth: 800, maxHeight: '94%', backgroundColor: theme.surface, borderRadius: 12, overflow: 'hidden' },
    header: { padding: 18, gap: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: theme.border },
    title: { flex: 1, fontSize: 22, lineHeight: 30, color: theme.text, fontWeight: '700' },
    close: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
    scroll: { flexShrink: 1 },
    document: { padding: 20, gap: 18 },
    summary: { color: theme.text, fontSize: 17, lineHeight: 27 },
    section: { marginTop: 10, gap: 12 },
    heading: { color: theme.text, fontSize: 18, lineHeight: 27, fontWeight: '700' },
    paragraph: { color: theme.text, fontSize: 16, lineHeight: 26 },
    reference: { color: theme.muted, fontSize: 14, lineHeight: 23 },
    contact: { marginTop: 12, paddingTop: 20, borderTopWidth: 1, borderColor: theme.border, gap: 10 },
  });
}
