import { Button, type ButtonProps } from '@chakra-ui/react';

/**
 * An underlined text button: "Undo", "Manage tags". Its tap area is 40 px tall and 8 px wider on each side (the text
 * alone is ~16 px, under the 24 px minimum); negative margins keep the text and everything around it where it would be
 * without it, so there must be that much free space around it. Props override the defaults.
 */
export function TextButton(props: ButtonProps) {
  return (
    <Button
      variant="plain"
      h="10"
      minW="0"
      px="2"
      mx="-2"
      my="-3"
      textStyle="body"
      textDecoration="underline"
      textUnderlineOffset="3px"
      _hover={{ color: 'accent' }}
      {...props}
    />
  );
}
