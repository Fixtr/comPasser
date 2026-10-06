import { findPlannerRequestIssue } from '../../../../functions/planner-request-validation.mjs';
import { normalizePlannerRequest } from './planner-constraints.mjs';
import { t } from '../../../utils/i18n.js';

export function findPlannerInputIssue(request) {
  return findPlannerRequestIssue(normalizePlannerRequest(request));
}

// Server details contain reason codes, not trusted display text.
export function plannerValidationMessage(issue) {
  const keys = {
    'missing-days': 'plannerDateError', 'invalid-date': 'plannerDateError',
    'date-mismatch': 'plannerDateError', 'date-order': 'plannerDateError',
    'day-order': 'plannerDateError', 'day-limit': 'plannerDayLimitError',
    'invalid-time': 'emptyTimeValidationError', 'time-order': 'basicTimeValidationError',
    'missing-location': 'plannerLocationError',
    'overnight-length': 'plannerLocationError', 'overnight-mismatch': 'plannerLocationError',
    'invalid-anchors': 'plannerAnchorError', 'incomplete-anchor': 'plannerAnchorError',
    'invalid-anchor-time': 'plannerAnchorError', 'anchor-time-order': 'plannerAnchorError',
    'anchor-day': 'plannerAnchorDayError', 'anchor-limit': 'plannerAnchorLimitError',
    'anchor-bounds': 'plannerAnchorBoundsError'
  };
  const message = t(Object.hasOwn(keys, issue?.reason) ? keys[issue.reason] : 'invalidPlannerRequestError');
  return Number.isInteger(issue?.day) && issue.day >= 1 && issue.day <= 4 ? `[Day ${issue.day}] ${message}` : message;
}
