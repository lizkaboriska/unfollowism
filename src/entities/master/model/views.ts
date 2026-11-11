import type { ValueOf } from '@/shared/lib/valueOf.ts';

import { ACTION_TYPE_ORDER, ACTION_TYPES, type ActionType } from '../lib/types.ts';

/**
 * Which page the main view shows: the review queue, what changed since the last save (its own sections, not a
 * filtered list), or a list of planned actions.
 */
export const LIST_VIEWS = {
  REVIEW: 'review',
  CHANGES: 'changes',
  TO_UNFOLLOW: 'toUnfollow',
  TO_REMOVE: 'toRemove',
} as const;
export type ListView = ValueOf<typeof LIST_VIEWS>;

/** The To do tabs, and the action each one lists, queued or done. Review's filters don't apply there. */
export const PLAN_VIEW_ACTIONS = {
  [LIST_VIEWS.TO_UNFOLLOW]: ACTION_TYPES.UNFOLLOW,
  [LIST_VIEWS.TO_REMOVE]: ACTION_TYPES.REMOVE_FOLLOWER,
} as const satisfies Partial<Record<ListView, ActionType>>;
export type PlanView = keyof typeof PLAN_VIEW_ACTIONS;

/** The To do list of each action (the reverse of PLAN_VIEW_ACTIONS). */
export const ACTION_PLAN_VIEWS = {
  [ACTION_TYPES.UNFOLLOW]: LIST_VIEWS.TO_UNFOLLOW,
  [ACTION_TYPES.REMOVE_FOLLOWER]: LIST_VIEWS.TO_REMOVE,
} as const satisfies Record<ActionType, PlanView>;

/** The lists of the To do page, in display order. */
export const TODO_VIEWS: readonly PlanView[] = ACTION_TYPE_ORDER.map(type => ACTION_PLAN_VIEWS[type]);

export function isPlanView(view: ListView): view is PlanView {
  return Object.hasOwn(PLAN_VIEW_ACTIONS, view);
}
