import { Box, Button, HStack, Heading, Stack, Text } from "@chakra-ui/react";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { resetChanges } from "../store/masterSlice.ts";
import { selectHasProject, selectIsDirty, selectUnsavedAccountCount } from "../store/selectors.ts";
import { SAVE_STATUSES } from "../store/statuses.ts";
import { saveMaster } from "../store/thunks.ts";
import { useConfirm } from "./dialogs.tsx";
import { plural } from "./statusText.ts";

/** `onImportNew` shows the Import files button (hidden while the import screen is open). */
export function Header({ onImportNew }: { onImportNew?: () => void }) {
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
  const hasProject = useAppSelector(selectHasProject);
  const dirty = useAppSelector(selectIsDirty);
  const unsavedCount = useAppSelector(selectUnsavedAccountCount);
  const saving = useAppSelector(s => s.master.saveStatus === SAVE_STATUSES.SAVING);

  async function onReset() {
    const confirmed = await confirm({
      title: "Reset changes?",
      body: `Changes to ${plural(unsavedCount, "account")} since your last save (or since the import, if you haven't saved since) will be undone.`,
      confirmLabel: "Reset",
      destructive: true,
    });
    if (confirmed) dispatch(resetChanges());
  }

  return (
    <Stack direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "stretch", md: "center" }} gap="3">
      <Box>
        <Heading size="2xl">Instagram Review</Heading>
        <Text color="fg.muted">Keep your feed fun. Keep your people intentional.</Text>
      </Box>
      <HStack gap="3" wrap="wrap">
        {hasProject && <Text color={dirty ? "yellow.700" : "green.700"}>{dirty ? "Unsaved changes" : "Saved"}</Text>}
        {hasProject && onImportNew && <Button variant="outline" onClick={onImportNew}>Import files</Button>}
        <Button variant="outline" disabled={unsavedCount === 0 || saving} onClick={() => void onReset()}>
          Reset changes
        </Button>
        <Button variant="outline" loading={saving} disabled={!hasProject || !dirty} onClick={() => void dispatch(saveMaster())}>
          Save master
        </Button>
      </HStack>
    </Stack>
  );
}
