import { Text } from '@chakra-ui/react';
import { useCallback, useMemo, useState } from 'react';

import { useAppSelector } from '../store/hooks.ts';
import { selectListKeys } from '../store/listSlice.ts';

import { AccountList, type ListItems } from './AccountList.tsx';
import { AccountSheet } from './AccountSheet.tsx';
import { NoResults } from './NoResults.tsx';
import { ReviewCard } from './ReviewCard.tsx';

/** Rough height of a Review card before measuring. */
const ESTIMATED_REVIEW_CARD_HEIGHT = 140;

/** Review's cards; tapping one opens its account sheet. The privacy line closes the list. */
export function ReviewList() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const hasList = useAppSelector(selectListKeys).length > 0;
  const open = useCallback((accountKey: string) => {
    setOpenKey(accountKey);
  }, []);
  const items = useMemo(
    (): ListItems => ({
      render: accountKey => <ReviewCard accountKey={accountKey} onOpen={open} />,
      estimatedHeight: ESTIMATED_REVIEW_CARD_HEIGHT,
      empty: <NoResults />,
    }),
    [open],
  );
  return (
    <>
      <AccountList items={items} />
      {hasList && (
        <Text textStyle="small" color="fg.muted" textAlign="center">
          On your device. Never connected to Instagram.
        </Text>
      )}
      <AccountSheet
        accountKey={openKey}
        onClose={() => {
          setOpenKey(null);
        }}
      />
    </>
  );
}
