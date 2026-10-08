import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { HAND_FONT, colors, radius } from '@/lib/theme';
import { localDay } from '@/lib/util';

/** Tap-to-pick date stored as YYYY-MM-DD. */
export function DateField({ value, onChange, placeholder = 'Pick a date' }: { value: string | null; onChange: (day: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ backgroundColor: colors.card, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 12 }}
      >
        <Text style={{ fontFamily: HAND_FONT, fontSize: 20, color: value ? colors.text : colors.textFaint }}>
          📅 {value ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : placeholder}
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
