/**
 * Template for src/Config.js. Copy it there, fill in your values, then `npm run push`:
 *
 *   cp Config.example.js src/Config.js
 *
 * src/Config.js is gitignored, so your calendar IDs stay out of the repo.
 * Calendar IDs are in each calendar's settings under "Integrate calendar".
 */
const CONFIG = {
  // Your work calendar. 'primary' means the work account's main calendar.
  WORK_CALENDAR_ID: 'primary',

  // Calendars whose busy times should block work time: your personal
  // calendars, plus (with more than one job) the other companies' "Work Busy"
  // calendars. Share each with this work account as "See only free/busy".
  // Do NOT include this copy's own "Work Busy" calendar here.
  PERSONAL_SOURCE_CALENDAR_IDS: [
    'you@example.com',
    // 'xxxxxxxx@group.calendar.google.com', // another personal calendar
    // 'yyyyyyyy@group.calendar.google.com', // another company's "Work Busy"
  ],

  // This copy's personal "Work Busy" calendar, which receives work blocks.
  // Share it with this work account as "Make changes to events".
  // Each company gets its own; never point two copies at the same one.
  PERSONAL_TARGET_CALENDAR_ID: 'xxxxxxxx@group.calendar.google.com',

  // Titles for the blocks the script creates.
  WORK_BLOCK_TITLE: 'Busy',
  PERSONAL_BLOCK_TITLE: 'Work Meetings',

  // How far ahead to sync, and how often (1, 5, 10, 15 or 30 minutes).
  DAYS_AHEAD: 14,
  SYNC_EVERY_MINUTES: 15,
};
