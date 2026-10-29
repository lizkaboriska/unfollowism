import { ChakraProvider } from '@chakra-ui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';

import { makeTestStore, prepared } from '../../store/__tests__/testStore.ts';
import { resetChanges } from '../../store/masterSlice.ts';
import { selectAccount } from '../../store/selectors.ts';
import { importPrepared } from '../../store/thunks.ts';
import { system } from '../../theme.ts';
import { AccountCard } from '../AccountCard.tsx';

async function card() {
  const { store } = makeTestStore();
  await store.dispatch(importPrepared(prepared())).unwrap();
  render(
    <ChakraProvider value={system}>
      <Provider store={store}>
        <AccountCard accountKey="bob" />
        <button>elsewhere</button>
      </Provider>
    </ChakraProvider>,
  );
  const storedNote = () => selectAccount(store.getState(), 'bob')?.review.notes;
  return {
    store,
    user: userEvent.setup(),
    storedNote,
    field: () => screen.getByRole('textbox', { name: 'Note for @bob' }),
  };
}

test('typing shows at once and is stored once, after a pause', async () => {
  const { store, user, storedNote, field } = await card();
  const before = store.getState().master.revision;

  await user.type(field(), 'met at a show');
  expect(field()).toHaveValue('met at a show');
  expect(storedNote()).toBe(''); // still typing

  await waitFor(() => {
    expect(storedNote()).toBe('met at a show');
  });
  expect(store.getState().master.revision).toBe(before + 1); // one edit, not one per letter
});

test('leaving the field stores the note without waiting', async () => {
  const { user, storedNote, field } = await card();
  await user.type(field(), 'hi');
  await user.click(screen.getByRole('button', { name: 'elsewhere' }));
  expect(storedNote()).toBe('hi');
});

test('a change from elsewhere shows in the field', async () => {
  const { store, user, storedNote, field } = await card();
  await user.type(field(), 'draft');
  await user.click(screen.getByRole('button', { name: 'elsewhere' }));
  act(() => {
    store.dispatch(resetChanges());
  });
  expect(storedNote()).toBe('');
  expect(field()).toHaveValue('');
});
