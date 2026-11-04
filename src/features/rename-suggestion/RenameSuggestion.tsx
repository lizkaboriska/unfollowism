import { Box, Button, Stack, Text } from '@chakra-ui/react';

import { confirmRename, dismissRename, selectAccount } from '@/entities/master';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';

/**
 * Under a row in No longer follow you, on an account an import thinks was renamed: move its review work to the
 * new name, or dismiss. The suggestion is saved with the account until it is decided.
 */
export function RenameSuggestion({ accountKey }: { accountKey: string }) {
  const dispatch = useAppDispatch();
  const suggestion = useAppSelector(s => selectAccount(s, accountKey)?.renameSuggestion);
  const newName = useAppSelector(s => (suggestion ? selectAccount(s, suggestion.to)?.username : undefined));
  if (!suggestion || newName === undefined) {
    return null;
  }

  return (
    <Box role="note" mx="3" mb="3" borderWidth="1px" p="3">
      <Text lineHeight="1.4">
        <Text as="span" textStyle="control">
          ⚠ Looks renamed
        </Text>{' '}
        <Text as="span" color="fg.muted">
          to @{newName}: same follow dates.
        </Text>
      </Text>
      <Stack gap="2" mt="2">
        <Button variant="outline" w="full" h="10" onClick={() => dispatch(confirmRename({ from: accountKey }))}>
          <Text as="span" minW="0" truncate>
            Move to @{newName}
          </Text>
        </Button>
        <Button
          variant="plain"
          w="full"
          h="10"
          px="2"
          textDecoration="underline"
          textUnderlineOffset="3px"
          onClick={() => dispatch(dismissRename({ from: accountKey }))}
        >
          Not a rename
        </Button>
      </Stack>
    </Box>
  );
}
