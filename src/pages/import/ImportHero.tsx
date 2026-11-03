import { Box, Button, HStack, Heading, List, Stack, Text } from '@chakra-ui/react';

import { useAlert } from '@/shared/ui/useAlert.ts';

const HELP = (
  <Stack gap="3">
    <Text>To get your export from Instagram:</Text>
    <List.Root as="ol" ps="5">
      <List.Item>
        Open Accounts Center → Your information and permissions → <b>Export your information</b> (called Download your
        information in some versions) → Create export, and choose your Instagram profile.
      </List.Item>
      <List.Item>
        Select only <b>Followers and following</b>.
      </List.Item>
      <List.Item>
        Set the date range to <b>All time</b>: a shorter range leaves people out, and they would look unfollowed.
      </List.Item>
      <List.Item>
        Pick the <b>JSON</b> format (not HTML), then start the export.
      </List.Item>
      <List.Item>It's usually ready within minutes to a few hours. Then download the .zip.</List.Item>
    </List.Root>
    <Text>
      Then add that .zip (or the following.json and followers_*.json files from it) and the progress file you saved last
      time, if you have one. They can be in different folders: add them one after another. Nothing leaves your browser.
    </Text>
  </Stack>
);

/** The top of the Welcome and Import screen: app name, the "?" help, and the slogan. */
export function ImportHero() {
  const alert = useAlert();
  return (
    <Box>
      <HStack as="header" h="72px" px="5" pt="4" justify="space-between" borderBottomWidth="1px">
        <Heading textStyle="appName" lineHeight="1">
          Unfollowism
        </Heading>
        <Button
          variant="outline"
          w="10"
          h="10"
          minW="10"
          p="0"
          textStyle="name"
          aria-label="How to get your Instagram export"
          onClick={() => void alert({ title: 'Getting your Instagram export', body: HELP })}
        >
          ?
        </Button>
      </HStack>
      <Stack gap="3" px="5" pt="6">
        <Heading as="h1" textStyle="title" lineHeight="1.05" textWrap="balance">
          Keep your feed fun. Keep your people intentional.
        </Heading>
        <Text color="fg.muted">
          A private space to tidy your Instagram circle. Bring your data, decide who stays, and keep a little more of
          what you love.
        </Text>
      </Stack>
    </Box>
  );
}
