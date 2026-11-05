/**
 * Busy-time sync between a Google Workspace calendar and personal calendars.
 * Runs in the WORK account. See README.md for setup.
 *
 *   Personal calendars (free/busy only) --> "Busy" blocks on the work calendar
 *   Work calendar (full events)          --> "Work Meetings" blocks on the personal "Work Busy" calendar
 *
 * Every block this script creates is tagged with a private extended property.
 * The script skips tagged events when reading, and only ever edits or deletes
 * tagged events, so it can't loop and can't touch your real events.
 */

const TAG_KEY = 'calsync';
const TAG_FROM_PERSONAL = 'from-personal'; // blocks on the work calendar
const TAG_FROM_WORK = 'from-work';         // blocks on the personal "Work Busy" calendar

// Work event types that shouldn't block personal time.
const SKIP_EVENT_TYPES = ['outOfOffice', 'workingLocation', 'birthday'];

/** Main entry point. Run by the time-based trigger, or manually from the editor. */
function syncNow() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) {
    console.warn('Previous run still in progress; skipping.');
    return;
  }
  try {
    validateConfig_();
    const { timeMin, timeMax } = syncWindow_();

    // Personal -> work
    const personalBusy = personalBusyIntervals_(timeMin, timeMax);
    reconcile_(CONFIG.WORK_CALENDAR_ID, personalBusy, TAG_FROM_PERSONAL,
      CONFIG.WORK_BLOCK_TITLE, timeMin, timeMax);

    // Work -> personal
    const workBusy = workBusyIntervals_(timeMin, timeMax);
    reconcile_(CONFIG.PERSONAL_TARGET_CALENDAR_ID, workBusy, TAG_FROM_WORK,
      CONFIG.PERSONAL_BLOCK_TITLE, timeMin, timeMax);
  } finally {
    lock.releaseLock();
  }
}

/** Creates the recurring trigger (replacing any existing one). Run once after setup. */
function installTrigger() {
  removeTriggers_();
  ScriptApp.newTrigger('syncNow')
    .timeBased()
    .everyMinutes(CONFIG.SYNC_EVERY_MINUTES)
    .create();
  console.log(`Sync will run every ${CONFIG.SYNC_EVERY_MINUTES} minutes.`);
}

/** Stops automatic syncing. Existing blocks stay where they are. */
function uninstallTrigger() {
  removeTriggers_();
  console.log('Trigger removed.');
}

/**
 * Stops syncing and deletes every block this script ever created, however old.
 * Stops after about 5 minutes to stay under Apps Script's 6-minute limit;
 * if blocks are left, the log says so and you can run it again.
 */
function removeAllBlocks() {
  removeTriggers_();
  const deadline = Date.now() + 5 * 60 * 1000;
  const targets = [
    [CONFIG.WORK_CALENDAR_ID, TAG_FROM_PERSONAL],
    [CONFIG.PERSONAL_TARGET_CALENDAR_ID, TAG_FROM_WORK],
  ];
  let left = 0;
  for (const [calendarId, tag] of targets) {
    const blocks = listEvents_(calendarId, null, null, {
      privateExtendedProperty: `${TAG_KEY}=${tag}`,
    }).filter(e => e.status !== 'cancelled');
    let deleted = 0;
    for (const e of blocks) {
      if (Date.now() > deadline) break;
      Calendar.Events.remove(calendarId, e.id);
      deleted++;
    }
    left += blocks.length - deleted;
    console.log(`${calendarId} [${tag}]: ${deleted} removed, ${blocks.length - deleted} left`);
  }
  console.log(left
    ? `${left} blocks left. Run removeAllBlocks again to finish.`
    : 'All blocks removed.');
}

// ---------------------------------------------------------------------------

/**
 * From the start of yesterday through DAYS_AHEAD days from today, in the script's
 * time zone. Starting a day back keeps the window's start in the past for any
 * time zone, so no current or upcoming block gets clipped if the manifest's
 * timeZone doesn't match yours.
 */
function syncWindow_() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const timeMin = new Date(today);
  timeMin.setDate(timeMin.getDate() - 1);
  const timeMax = new Date(today);
  timeMax.setDate(timeMax.getDate() + CONFIG.DAYS_AHEAD);
  return { timeMin, timeMax };
}

/** Busy intervals across the personal calendars, via a single free/busy query. */
function personalBusyIntervals_(timeMin, timeMax) {
  const res = Calendar.Freebusy.query({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    items: CONFIG.PERSONAL_SOURCE_CALENDAR_IDS.map(id => ({ id })),
  });

  const intervals = [];
  for (const id of CONFIG.PERSONAL_SOURCE_CALENDAR_IDS) {
    const cal = res.calendars && res.calendars[id];
    // Fail loudly rather than silently treating an unreadable calendar as empty,
    // which would delete all of its blocks from the work calendar.
    if (!cal || (cal.errors && cal.errors.length)) {
      throw new Error(`Can't read free/busy for ${id}: ` +
        `${JSON.stringify(cal && cal.errors)}. Is it shared with this account?`);
    }
    for (const b of cal.busy || []) {
      intervals.push({ start: Date.parse(b.start), end: Date.parse(b.end) });
    }
  }
  return mergeIntervals_(intervals);
}

/** Busy intervals from real (non-mirror) events on the work calendar. */
function workBusyIntervals_(timeMin, timeMax) {
  const intervals = [];
  for (const e of listEvents_(CONFIG.WORK_CALENDAR_ID, timeMin, timeMax)) {
    if (e.status === 'cancelled') continue;
    if (isMirror_(e)) continue;                          // never copy our own blocks
    if (!e.start.dateTime || !e.end.dateTime) continue;  // all-day event
    if (e.transparency === 'transparent') continue;      // marked "free"
    if (SKIP_EVENT_TYPES.includes(e.eventType)) continue;
    if (declinedBySelf_(e)) continue;
    intervals.push({ start: Date.parse(e.start.dateTime), end: Date.parse(e.end.dateTime) });
  }
  return mergeIntervals_(intervals);
}

/**
 * Makes the tagged blocks on `calendarId` match `intervals` exactly:
 * creates missing blocks, deletes stale or duplicate ones, and renames matches
 * whose title differs from `title`.
 */
function reconcile_(calendarId, intervals, tag, title, timeMin, timeMax) {
  const existing = listEvents_(calendarId, timeMin, timeMax, {
    privateExtendedProperty: `${TAG_KEY}=${tag}`,
  }).filter(e => e.status !== 'cancelled');

  const wanted = new Map(intervals.map(i => [key_(i), i]));
  let created = 0;
  let deleted = 0;
  let renamed = 0;

  for (const e of existing) {
    const k = key_({ start: Date.parse(e.start.dateTime), end: Date.parse(e.end.dateTime) });
    if (wanted.has(k)) {
      wanted.delete(k); // already in place (a second copy will be deleted below)
      if (e.summary !== title) {
        Calendar.Events.patch({ summary: title }, calendarId, e.id);
        renamed++;
      }
    } else {
      Calendar.Events.remove(calendarId, e.id);
      deleted++;
    }
  }

  for (const i of wanted.values()) {
    Calendar.Events.insert({
      summary: title,
      start: { dateTime: new Date(i.start).toISOString() },
      end: { dateTime: new Date(i.end).toISOString() },
      transparency: 'opaque',                             // shows as busy
      visibility: 'private',
      reminders: { useDefault: false, overrides: [] },    // no alerts
      extendedProperties: { private: { [TAG_KEY]: tag } },
    }, calendarId);
    created++;
  }

  console.log(`${calendarId} [${tag}]: ${created} created, ${deleted} removed, ` +
    `${renamed} renamed, ${existing.length - deleted - renamed} unchanged`);
}

function listEvents_(calendarId, timeMin, timeMax, extraParams) {
  const items = [];
  let pageToken = null;
  do {
    const params = Object.assign({
      singleEvents: true,
      maxResults: 2500,
    }, extraParams || {});
    // A null bound means no limit on that side.
    if (timeMin) params.timeMin = timeMin.toISOString();
    if (timeMax) params.timeMax = timeMax.toISOString();
    if (pageToken) params.pageToken = pageToken;
    const res = Calendar.Events.list(calendarId, params);
    items.push(...(res.items || []));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return items;
}

/** Sorts and merges overlapping or back-to-back intervals into single blocks. */
function mergeIntervals_(intervals) {
  const sorted = intervals
    .filter(i => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) {
      last.end = Math.max(last.end, i.end);
    } else {
      out.push({ start: i.start, end: i.end });
    }
  }
  return out;
}

function removeTriggers_() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'syncNow') ScriptApp.deleteTrigger(t);
  }
}

function isMirror_(e) {
  return Boolean(e.extendedProperties && e.extendedProperties.private &&
    e.extendedProperties.private[TAG_KEY]);
}

function declinedBySelf_(e) {
  return (e.attendees || []).some(a => a.self && a.responseStatus === 'declined');
}

function key_(i) {
  return `${i.start}-${i.end}`;
}

function validateConfig_() {
  const sources = CONFIG.PERSONAL_SOURCE_CALENDAR_IDS || [];
  if (!sources.length) throw new Error('PERSONAL_SOURCE_CALENDAR_IDS is empty.');
  if (!CONFIG.PERSONAL_TARGET_CALENDAR_ID) throw new Error('PERSONAL_TARGET_CALENDAR_ID is not set.');
  // Reading the target calendar as a source would copy work blocks back to work.
  if (sources.includes(CONFIG.PERSONAL_TARGET_CALENDAR_ID)) {
    throw new Error('The "Work Busy" calendar must not be listed as a personal source.');
  }
  if (sources.includes(CONFIG.WORK_CALENDAR_ID)) {
    throw new Error('The work calendar must not be listed as a personal source.');
  }
}
