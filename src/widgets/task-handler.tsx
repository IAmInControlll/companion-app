"use no memo";

import { requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';

import { sendNudge } from '@/lib/api';

import { WIDGET_NAMES, clearWidgetSpace, loadWidget, type MissYouData, type WidgetName } from './data';
import { MissYouWidget, renderWidgetFor } from './widgets';

/** Runs headless whenever Android asks a widget to update, or the user taps one. */
export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }: WidgetTaskHandlerProps) {
  const name = widgetInfo.widgetName as WidgetName;

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const payload = await loadWidget(name, widgetInfo.widgetId);
      renderWidget(renderWidgetFor(name, payload, widgetInfo));
      break;
    }
    case 'WIDGET_DELETED':
      await clearWidgetSpace(widgetInfo.widgetId);
      break;
    case 'WIDGET_CLICK': {
      if (clickAction === 'MISS_YOU') {
        const spaceId = clickActionData?.spaceId as string | undefined;
        const before = await loadWidget('MissYou', widgetInfo.widgetId);
        if (spaceId && before.status === 'ok') {
          // Optimistic "Sent!" state, then the real count.
          renderWidget(<MissYouWidget data={before.data as MissYouData} spaceId={spaceId} sent />);
          try {
            await sendNudge(spaceId, 'miss_you');
          } catch {
            // fall through to re-render the normal state
          }
          await new Promise((r) => setTimeout(r, 1800));
          renderWidget(renderWidgetFor('MissYou', await loadWidget('MissYou', widgetInfo.widgetId), widgetInfo));
        } else {
          renderWidget(renderWidgetFor('MissYou', before, widgetInfo));
        }
      }
      break;
    }
  }
}

/** Redraw widgets on the home screen. Pass '*' to refresh every kind. */
export async function refreshWidgets(names: WidgetName[] | '*' = '*') {
  const list = names === '*' ? WIDGET_NAMES : names;
  await Promise.all(
    list.map((name) =>
      requestWidgetUpdate({
        widgetName: name,
        renderWidget: async (info) => renderWidgetFor(name, await loadWidget(name, info.widgetId), info),
      }).catch(() => {}),
    ),
  );
}
