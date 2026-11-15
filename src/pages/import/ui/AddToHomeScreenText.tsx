import { Text, type TextProps } from '@chakra-ui/react';

/** Safari's step to add the app (Apple's steps, default layout): ☰ shown bigger, so it reads as the button. */
export function AddToHomeScreenText(props: TextProps) {
  return (
    <Text {...props}>
      In Safari, tap{' '}
      <Text
        as="span"
        role="img"
        aria-label="the menu button"
        fontSize="21px"
        fontWeight="600"
        lineHeight="1"
        verticalAlign="-2px"
      >
        ☰
      </Text>{' '}
      left of the address → Share → swipe up → Add to Home Screen → keep "Open as Web App" on → Add.
    </Text>
  );
}
