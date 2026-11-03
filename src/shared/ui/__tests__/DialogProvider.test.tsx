import { ChakraProvider } from '@chakra-ui/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DialogProvider } from '../DialogProvider.tsx';
import { system } from '../theme.ts';
import { useConfirm } from '../useConfirm.ts';

test('a dialog opened over another one cancels the first, and the second still answers', async () => {
  const answers: [string, boolean][] = [];
  function Asker() {
    const confirm = useConfirm();
    const ask = (title: string) => {
      void confirm({ title, body: title, confirmLabel: 'Yes' }).then(answer => {
        answers.push([title, answer]);
      });
    };
    return (
      <button
        onClick={() => {
          ask('First');
          ask('Second');
        }}
      >
        Ask twice
      </button>
    );
  }
  render(
    <ChakraProvider value={system}>
      <DialogProvider>
        <Asker />
      </DialogProvider>
    </ChakraProvider>,
  );
  const user = userEvent.setup();

  await user.click(screen.getByRole('button', { name: 'Ask twice' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByRole('heading', { name: 'Second' })).toBeInTheDocument();
  await waitFor(() => {
    expect(answers).toEqual([['First', false]]);
  });

  await user.click(within(dialog).getByRole('button', { name: 'Yes' }));
  await waitFor(() => {
    expect(answers).toEqual([
      ['First', false],
      ['Second', true],
    ]);
  });
});
