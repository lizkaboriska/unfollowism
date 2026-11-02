import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

// The G2f design system (REDESIGN.md): black on white, square, 1px ink lines, one electric blue. Light only.
// Chakra's own components read the semantic tokens below, so overriding them restyles every component at once.
const PAPER = '#ffffff';
const INK = '#111111';
const MUTED = '#555555';
const BLUE = '#1f3dff';
const RED = '#c4161c';

/** A color palette for `colorPalette`: one color for fills, lines and text; white inside fills; no grey tints. */
function palette(color: string) {
  return {
    DEFAULT: { value: color },
    solid: { value: color },
    contrast: { value: PAPER },
    fg: { value: color },
    subtle: { value: PAPER },
    muted: { value: color },
    emphasized: { value: color },
    border: { value: color },
    focusRing: { value: BLUE },
  };
}

/**
 * Text in a field you type into: iPhone Safari zooms into a field whose text is under 16px when it's tapped, and
 * stays zoomed. So on phones fields use 16px (a fixed px: a rem size could land just under it); from md up the
 * design's size for that field size.
 */
function fieldText(designSize: 'xs' | 'sm' | 'md') {
  return { fontSize: { base: '16px', md: designSize } };
}

// Soft shadows become a 1px ink frame (dialogs, menus, popovers).
const frame = { value: `0 0 0 1px ${INK}` };

export const system = createSystem(
  defaultConfig,
  defineConfig({
    globalCss: {
      html: { colorPalette: 'ink' },
      body: { textStyle: 'body' },
      '*::selection': { bg: 'accent', color: 'paper' },
    },
    theme: {
      tokens: {
        fonts: {
          heading: { value: `Newsreader, Georgia, serif` },
          body: { value: `Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif` },
        },
        // The design's sizes: 11 · 13 · 15 (Chakra's xs · sm · md), 26 · 32 · 44 in the text styles.
        fontSizes: {
          xs: { value: '0.6875rem' },
          sm: { value: '0.8125rem' },
          md: { value: '0.9375rem' },
        },
      },
      semanticTokens: {
        colors: {
          paper: { value: PAPER },
          ink: palette(INK),
          accent: palette(BLUE),
          danger: palette(RED),
          overlay: { value: 'rgba(17, 17, 17, 0.4)' },
          bg: {
            DEFAULT: { value: PAPER },
            subtle: { value: PAPER },
            muted: { value: PAPER },
            emphasized: { value: PAPER },
            panel: { value: PAPER },
            inverted: { value: INK },
            error: { value: PAPER },
          },
          fg: {
            DEFAULT: { value: INK },
            muted: { value: MUTED },
            subtle: { value: MUTED },
            inverted: { value: PAPER },
            error: { value: RED },
          },
          border: {
            DEFAULT: { value: INK },
            muted: { value: INK },
            subtle: { value: INK },
            emphasized: { value: INK },
            inverted: { value: PAPER },
            error: { value: RED },
          },
        },
        radii: {
          l1: { value: '0' },
          l2: { value: '0' },
          l3: { value: '0' },
        },
        shadows: { xs: frame, sm: frame, md: frame, lg: frame, xl: frame, '2xl': frame },
      },
      textStyles: {
        title: {
          value: {
            fontFamily: 'heading',
            fontSize: '2.75rem',
            fontWeight: '600',
            fontStyle: 'italic',
            lineHeight: '1',
            letterSpacing: '-0.01em',
          },
        },
        appName: {
          value: {
            fontFamily: 'heading',
            fontSize: '1.625rem',
            fontWeight: '600',
            fontStyle: 'italic',
            letterSpacing: '-0.01em',
          },
        },
        sheetTitle: {
          value: { fontFamily: 'heading', fontSize: '1.625rem', fontWeight: '600', fontStyle: 'italic' },
        },
        number: { value: { fontFamily: 'heading', fontSize: '2rem', fontWeight: '500', lineHeight: '1' } },
        note: {
          value: { fontFamily: 'heading', fontSize: 'md', fontWeight: '400', fontStyle: 'italic', lineHeight: '1.2' },
        },
        name: { value: { fontFamily: 'body', fontSize: 'md', fontWeight: '500' } },
        body: { value: { fontFamily: 'body', fontSize: 'sm', fontWeight: '400' } },
        control: { value: { fontFamily: 'body', fontSize: 'sm', fontWeight: '500' } },
        small: { value: { fontFamily: 'body', fontSize: 'xs', fontWeight: '400' } },
        count: { value: { fontFamily: 'body', fontSize: 'xs', fontWeight: '500', color: 'accent' } },
      },
      recipes: {
        // Chakra's own field sizes, each kept at its design size from md up (2xl is already 18px).
        input: {
          variants: {
            size: {
              '2xs': fieldText('xs'),
              xs: fieldText('xs'),
              sm: fieldText('sm'),
              md: fieldText('sm'),
              lg: fieldText('md'),
              xl: fieldText('md'),
            },
          },
        },
        textarea: {
          variants: {
            size: {
              xs: fieldText('xs'),
              sm: fieldText('sm'),
              md: fieldText('sm'),
              lg: fieldText('md'),
              xl: fieldText('md'),
            },
          },
        },
      },
      slotRecipes: {
        dialog: { slots: ['backdrop'], base: { backdrop: { bg: 'overlay' } } },
        drawer: { slots: ['backdrop'], base: { backdrop: { bg: 'overlay' } } },
        // Warnings are framed white boxes; errors use the destructive red.
        alert: {
          slots: ['root'],
          variants: {
            status: {
              info: { root: { colorPalette: 'ink' } },
              warning: { root: { colorPalette: 'ink' } },
              success: { root: { colorPalette: 'ink' } },
              neutral: { root: { colorPalette: 'ink' } },
              error: { root: { colorPalette: 'danger' } },
            },
          },
          defaultVariants: { variant: 'outline' },
        },
      },
    },
  }),
);
