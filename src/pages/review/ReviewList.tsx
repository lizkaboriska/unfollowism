import { Text } from '@chakra-ui/react';
import { useCallback, useMemo, useState } from 'react';

import { ReviewCard } from '@/entities/master';
import { AccountPopup } from '@/features/account-popup';
import { selectListKeys, NoResults } from '@/features/filters';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';
import { AccountList, type ListItems } from '@/widgets/account-list';

/** Rough height of a Review card before measuring. */
const ESTIMATED_REVIEW_CARD_HEIGHT = 140;

/** Review's cards; tapping one opens its account popup. The privacy line closes the list. */
export function ReviewList() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const hasList = useAppSelector(selectListKeys).length > 0;
  const scope = useAppSelector(s => s.filters.scope);
  const open = useCallback((accountKey: string) => {
    setOpenKey(accountKey);
  }, []);
  const items = useMemo(
    (): ListItems => ({
      render: accountKey => <ReviewCard accountKey={accountKey} scope={scope} onOpen={open} />,
      estimatedHeight: ESTIMATED_REVIEW_CARD_HEIGHT,
      empty: <NoResults />,
    }),
    [scope, open],
  );
  return (
    <>
      <AccountList items={items} />
      {hasList && (
        <Text textStyle="small" color="fg.muted" textAlign="center">
          On your device. Never connected to Instagram.
        </Text>
      )}
      <AccountPopup
        accountKey={openKey}
        onClose={() => {
          setOpenKey(null);
        }}
      />
    </>
  );
}
