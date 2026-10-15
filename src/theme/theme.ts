export const lightTheme = {
  mode: 'light' as const,
  background: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceAlt: '#F3EDE5',
  text: '#332F38',
  // Feature: stronger secondary and action inks keep small controls readable on pastel surfaces.
  muted: '#625C6B',
  accent: '#67518F',
  accentSoft: '#EAE3F5',
  // Feature: a muted violet paper tint highlights author plans consistently with the theme's primary accent.
  accentPaper: '#F4F1F8',
  secondary: '#396C59',
  secondarySoft: '#E2EFE8',
  peach: '#D99178',
  border: '#E8E1D9',
};

export const darkTheme = {
  mode: 'dark' as const,
  background: '#19191F',
  surface: '#24232C',
  surfaceAlt: '#302E38',
  text: '#F2EEF5',
  muted: '#B5AFBD',
  accent: '#C0AFE9',
  accentSoft: '#39334A',
  accentPaper: '#2B2735',
  secondary: '#9AC8B7',
  secondarySoft: '#2D403A',
  peach: '#E7A78F',
  border: '#3A3742',
};

export type Theme = typeof lightTheme | typeof darkTheme;
