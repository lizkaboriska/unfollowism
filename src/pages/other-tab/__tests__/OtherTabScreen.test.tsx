import { ChakraProvider } from '@chakra-ui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { system } from '@/shared/ui/theme.ts';

import { OtherTabScreen } from '../OtherTabScreen.tsx';

test('says the app is open in another tab; Use here moves the work to this tab', async () => {
  const onUseHere = vi.fn(() => new Promise<void>(() => undefined)); // still taking over
  render(
    <ChakraProvider value={system}>
      <OtherTabScreen onUseHere={onUseHere} />
    </ChakraProvider>,
  );
  expect(screen.getByRole('heading', { level: 1, name: 'Open in another tab' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Work in this tab?' })).toHaveTextContent(
    'Your work moves here, unsaved changes too. The other tab stops.',
  );

  await userEvent.setup().click(screen.getByRole('button', { name: 'Use here' }));
  expect(onUseHere).toHaveBeenCalledOnce();
  expect(screen.getByRole('button')).toBeDisabled(); // no second click while taking over
});
