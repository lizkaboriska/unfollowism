import { Link, type LinkProps } from '@chakra-ui/react';

import { profileUrl } from '../lib/util.ts';

import { openProfilePopup } from './instagramLink.ts';

/** "@name ↗": opens the Instagram profile in the side popup (see openProfilePopup). */
export function ProfileLink({ username, ...props }: { username: string } & LinkProps) {
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
      @{username} ↗
    </Link>
  );
}
