import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { colors, radius, type } from '@/lib/theme';

import { Icon } from './ui';
import { localDay } from '@/lib/util';

/** Tap-to-pick date stored as YYYY-MM-DD. */
export function DateField({ value, onChange, placeholder = 'Pick a date' }: { value: string | null; onChange: (day: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingVertical: 14 }}
      >
        <Icon name="event" size={20} color={colors.textDim} />
        <Text style={[type.body, { fontSize: 16, color: value ? colors.text : colors.textFaint }]}>
          {value ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : placeholder}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="date"
          onChange={(event, d) => {
            setOpen(false);
            if (event.type === 'set' && d) onChange(localDay(d));
          }}
        />
      ) : null}
    </>
  );
}
