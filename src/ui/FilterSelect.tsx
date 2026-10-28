import { useMemo } from "react";
import { Box, HStack, Portal, Select, Text, createListCollection } from "@chakra-ui/react";

export interface FilterOption<V extends string = string> {
  value: V;
  label: string;
  /** Shown to the right of the label, e.g. how many accounts have a tag. */
  count?: number;
  /** Draws a divider above this option. */
  separatorBefore?: boolean;
}

/**
 * A styled dropdown for the filters bar. Choosing an option calls `onChange` with that option's
 * own (typed) value; the shown value only changes when the parent passes a new `value`, so an
 * option can also act as an action (e.g. "Manage tags…") without becoming the selection.
 */
export function FilterSelect<V extends string>({ name, label, options, value, onChange }: {
  name: string;
  label: string;
  options: readonly FilterOption<V>[];
  value: V;
  onChange: (value: V) => void;
}) {
  const collection = useMemo(() => createListCollection({ items: [...options] }), [options]);
  return (
    <Select.Root
      collection={collection}
      size="sm"
      width={{ base: "full", md: "52" }}
      name={name}
      value={[value]}
      onValueChange={e => {
        const option = options.find(o => o.value === e.value[0]);
        if (option && option.value !== value) onChange(option.value);
      }}
      positioning={{ sameWidth: false, placement: "bottom-start" }}
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger aria-label={label}>
          <Select.ValueText />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content minW="52">
            {collection.items.map(option => (
              <Box key={option.value}>
                {option.separatorBefore && <Box as="hr" my="1" borderColor="border" />}
                <Select.Item item={option}>
                  <HStack flex="1" justify="space-between" gap="4">
                    <Select.ItemText>{option.label}</Select.ItemText>
                    {option.count !== undefined && <Text as="span" color="fg.muted" fontSize="xs">{option.count}</Text>}
                  </HStack>
                  <Select.ItemIndicator />
                </Select.Item>
              </Box>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
