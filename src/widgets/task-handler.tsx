"use no memo";

import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';

import { sendNudge } from '@/lib/api';
import { isNudgeKind } from '@/lib/nudges';
import type { NudgeKind } from '@/lib/types';

import { WIDGET_NAMES, clearWidgetSpace, loadWidget, type WidgetName } from './data';
import { NudgeSentWidget, renderWidgetFor } from './widgets';

/** How long "Sent" shows after a tap on the Miss you widget; taps meanwhile are ignored. */
const NUDGE_COOLDOWN_MS = 1000;

/**
 * Latest update started per widget. Dragging a resize handle fires an update per cell crossed, and
 * each waits on the network, so they can finish out of order: only the newest may draw.
 */
const latest = new Map<number, number>();
let updates = 0;

/** Runs headless whenever Android asks a widget to update, or the user taps one. */
export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }: WidgetTaskHandlerProps) {
  const name = widgetInfo.widgetName as WidgetName;

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const update = ++updates;
      latest.set(widgetInfo.widgetId, update);
      const payload = await loadWidget(name, widgetInfo.widgetId);
      if (latest.get(widgetInfo.widgetId) !== update) break;
      renderWidget(renderWidgetFor(name, payload, widgetInfo));
      break;
    }
    case 'WIDGET_DELETED':
      await clearWidgetSpace(widgetInfo.widgetId);
      break;
    case 'WIDGET_CLICK': {
      // 'MISS_YOU' is what widgets drawn by older versions still send.
      if (clickAction === 'NUDGE' || clickAction === 'MISS_YOU') {
        const spaceId = clickActionData?.spaceId as string | undefined;
        const kind: NudgeKind = isNudgeKind(clickActionData?.kind) ? clickActionData.kind : 'miss_you';
        if (!spaceId) break;
        // The "Sent" state has no tap target, but taps made just before it appeared still arrive.
        const key = `nudge-sent:${widgetInfo.widgetId}`;
        const last = Number(await AsyncStorage.getItem(key).catch(() => null)) || 0;
        if (Date.now() - last < NUDGE_COOLDOWN_MS) break;
        await AsyncStorage.setItem(key, String(Date.now())).catch(() => {});

        renderWidget(<NudgeSentWidget kind={kind} info={widgetInfo} />);
        const [ok] = await Promise.all([
          sendNudge(spaceId, kind).then(
            () => true,
            () => false,
          ),
          new Promise((r) => setTimeout(r, NUDGE_COOLDOWN_MS)),
        ]);
        if (!ok) {
          renderWidget(<NudgeSentWidget kind={kind} failed info={widgetInfo} />);
          await new Promise((r) => setTimeout(r, NUDGE_COOLDOWN_MS));
        }
        renderWidget(renderWidgetFor('MissYou', await loadWidget('MissYou', widgetInfo.widgetId), widgetInfo));
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
