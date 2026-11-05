// Feature: vector dropdown arrows stay sharp at every zoom level and align in an explicit 18px box.
export default function DropdownChevron({ color }: { color: string }) {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false" style={{ display: 'block', flexShrink: 0, pointerEvents: 'none' }}>
    <path d="m5 7 4 4 4-4" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
