import { Link } from '@chakra-ui/react';

import { profileUrl } from '../lib/util.ts';

import { openProfilePopup } from './instagramLink.ts';

/** "@name ↗": opens the Instagram profile in the side popup (see openProfilePopup). */
export function ProfileLink({ username }: { username: string }) {
  return (
    <Link
      href={profileUrl(username)}
      target="_blank"
      rel="noopener noreferrer"
      textStyle="name"
      onClick={openProfilePopup}
      wordBreak="break-all"
    >
      @{username} ↗
    </Link>
  );
}
