import { Button, type ButtonProps } from "@chakra-ui/react";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { resetChanges } from "../store/masterSlice.ts";
import { selectHasProject, selectIsDirty, selectUnsavedAccountCount } from "../store/selectors.ts";
import { SAVE_STATUSES } from "../store/statuses.ts";
import { saveMaster } from "../store/thunks.ts";
import { useConfirm } from "./dialogs.tsx";
import { plural } from "./statusText.ts";

/** Save master and Reset changes, shared by the header and the Unsaved changes drawer. */

export function SaveButton(props: ButtonProps) {
  const dispatch = useAppDispatch();
  const hasProject = useAppSelector(selectHasProject);
  const dirty = useAppSelector(selectIsDirty);
  const saving = useAppSelector(s => s.master.saveStatus === SAVE_STATUSES.SAVING);
  return (
    <Button variant="outline" {...props} loading={saving} disabled={!hasProject || !dirty} onClick={() => void dispatch(saveMaster())}>
      Save master
    </Button>
  );
}

export function ResetButton(props: ButtonProps) {
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
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
    <Button variant="outline" {...props} disabled={unsavedCount === 0 || saving} onClick={() => void onReset()}>
      Reset changes
    </Button>
  );
}
