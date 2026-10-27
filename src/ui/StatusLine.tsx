import { Alert, Text } from "@chakra-ui/react";
import { useAppSelector } from "../store/hooks.ts";
import { statusText } from "./statusText.ts";

/** What last happened (import, save…), and the latest error if there is one. */
export function StatusLine({ error }: { error: string | null }) {
  const message = statusText(useAppSelector(s => s.master.status));
  return (
    <>
      {error && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Title>{error}</Alert.Title>
        </Alert.Root>
      )}
      {message && <Text>{message}</Text>}
    </>
  );
}
