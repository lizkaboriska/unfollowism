import { ChakraProvider } from '@chakra-ui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';

import { makeTestStore, prepared } from '@/app/store/__tests__/testStore.ts';
import { importPrepared, setNote } from '@/entities/master';
import { system } from '@/shared/ui/theme.ts';

import { TabStoppedScreen } from '../TabStoppedScreen.tsx';

test('says the tab stopped and the work did not move; Save progress file downloads it', async () => {
  const t = makeTestStore();
  await t.store.dispatch(importPrepared(prepared())).unwrap();
  t.store.dispatch(setNote({ username: 'bob', note: 'not stored' }));
  render(
    <ChakraProvider value={system}>
      <Provider store={t.store}>
        <TabStoppedScreen />
      </Provider>
    </ChakraProvider>,
  );
  expect(screen.getByRole('heading', { level: 1, name: 'This tab stopped' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Save your work here' })).toHaveTextContent(
    "This browser couldn't store your unsaved changes, so they didn't move. Save your progress file, then add it in " +
      'the other tab.',
  );

  const save = screen.getByRole('button', { name: 'Save progress file' });
  await userEvent.setup().click(save);
  expect(t.downloads).toHaveLength(1);
  expect(t.downloads[0]?.text).toContain('not stored');
  expect(save).toBeDisabled(); // nothing left to save; the page stays
});
