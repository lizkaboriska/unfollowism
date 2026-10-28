import { Box, Button, HStack, Text } from "@chakra-ui/react";
import { LIST_VIEWS } from "../store/filtersSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { confirmRename, dismissRename } from "../store/masterSlice.ts";
import { selectAccount } from "../store/selectors.ts";
import { ProfileLink } from "./ProfileLink.tsx";

/**
 * In Lost followers, on an account an import thinks was renamed: move its review work to the
 * new name, or dismiss. The suggestion is saved with the account until it is decided.
 */
export function RenameSuggestion({ accountKey }: { accountKey: string }) {
  const dispatch = useAppDispatch();
  const suggestion = useAppSelector(s => (s.filters.view === LIST_VIEWS.LOST_FOLLOWERS ? selectAccount(s, accountKey)?.renameSuggestion : undefined));
  const newName = useAppSelector(s => (suggestion ? selectAccount(s, suggestion.to)?.username : undefined));
  if (!suggestion || newName === undefined) return null;

  return (
    <Box borderWidth="1px" borderColor="pink.200" bg="pink.50" borderRadius="md" p="2">
      <Text fontSize="sm">
        Looks renamed to <ProfileLink username={newName} />: same follow dates.
      </Text>
      <HStack gap="2" mt="2" wrap="wrap">
        <Button size="xs" colorPalette="pink" onClick={() => dispatch(confirmRename({ from: accountKey }))}>Move to @{newName}</Button>
        <Button size="xs" variant="ghost" onClick={() => dispatch(dismissRename({ from: accountKey }))}>Not a rename</Button>
      </HStack>
    </Box>
  );
}
