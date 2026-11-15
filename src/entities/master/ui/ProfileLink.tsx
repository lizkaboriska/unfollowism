import { Link, type LinkProps } from '@chakra-ui/react';

import { profileUrl } from '../lib/util.ts';

import { openProfilePopup } from './instagramLink.ts';

/**
 * "@name ↗": opens the Instagram profile in the side popup (see openProfilePopup). Without the arrow where it looks
 * wrong in a big title font (the account popup's title): the underline alone says it's a link.
 */
export function ProfileLink({
  username,
  hasArrow = true,
  ...props
}: { username: string; hasArrow?: boolean } & LinkProps) {
  return (
    <Link
      href={profileUrl(username)}
      target="_blank"
      rel="noopener noreferrer"
      textStyle="name"
      onClick={openProfilePopup}
      wordBreak="break-all"
      variant="underline"
      textDecorationColor="currentColor"
      {...props}
    >
      @{username}
      {hasArrow && ' ↗'}
    </Link>
  );
}
