import { Box, Button, HStack, Text } from '@chakra-ui/react';

import { confirmRename, dismissRename } from '@/entities/master/model/masterSlice.ts';
import { selectAccount } from '@/entities/master/model/selectors.ts';

import { useAppDispatch, useAppSelector } from '../store/hooks.ts';

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
    <Box role="note" mx="3" mb="3" borderWidth="1px" px="3" py="2.5">
      <Text lineHeight="1.4">
        <Text as="span" textStyle="control">
          ⚠ Looks renamed
        </Text>{' '}
        <Text as="span" color="fg.muted">
          to @{newName}: same follow dates.
        </Text>
      </Text>
      <HStack gap="2" mt="2.5">
        <Button variant="outline" flex="1" h="10" onClick={() => dispatch(confirmRename({ from: accountKey }))}>
          Move to @{newName}
        </Button>
        <Button
          variant="plain"
          h="10"
          px="2"
          textDecoration="underline"
          textUnderlineOffset="3px"
          onClick={() => dispatch(dismissRename({ from: accountKey }))}
        >
          Not a rename
        </Button>
      </HStack>
    </Box>
  );
}
