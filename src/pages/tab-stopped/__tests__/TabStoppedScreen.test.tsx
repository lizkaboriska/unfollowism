import { ChakraProvider } from '@chakra-ui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';

import { makeTestStore, prepared } from '@/app/store/__tests__/testStore.ts';
import { importPrepared, setNote } from '@/entities/master';
import { system } from '@/shared/ui/theme.ts';

import { TabStoppedScreen } from '../TabStoppedScreen.tsx';

test('says the tab stopped and the work did not move; Back up downloads it', async () => {
  const { store, downloads } = makeTestStore();
  await store.dispatch(importPrepared(prepared())).unwrap();
  store.dispatch(setNote({ username: 'bob', note: 'not stored' }));
  render(
    <ChakraProvider value={system}>
      <Provider store={store}>
        <TabStoppedScreen />
      </Provider>
    </ChakraProvider>,
  );
  expect(screen.getByRole('heading', { level: 1, name: 'This tab stopped' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Back up your work here' })).toHaveTextContent(
    "This browser couldn't store your latest changes, so they didn't move. " +
      'Back up to a progress file, then add it in the other tab.',
  );

  const save = screen.getByRole('button', { name: 'Back up' });
  await userEvent.setup().click(save);
  expect(downloads).toHaveLength(1);
  expect(downloads[0]?.text).toContain('not stored');
  expect(save).toBeDisabled(); // nothing left to save; the page stays
});
