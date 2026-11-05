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

  // Personal calendars whose busy times should block work time.
  // Share each with your work account as "See only free/busy".
  // Do NOT include the "Work Busy" calendar here.
  PERSONAL_SOURCE_CALENDAR_IDS: [
    'you@example.com',
    // 'xxxxxxxx@group.calendar.google.com', // another personal calendar
  ],

  // The personal "Work Busy" calendar that receives work blocks.
  // Share it with your work account as "Make changes to events".
  PERSONAL_TARGET_CALENDAR_ID: 'xxxxxxxx@group.calendar.google.com',

  // Titles for the blocks the script creates.
  WORK_BLOCK_TITLE: 'Busy',
  PERSONAL_BLOCK_TITLE: 'Work Meetings',

  // How far ahead to sync, and how often (1, 5, 10, 15 or 30 minutes).
  DAYS_AHEAD: 14,
  SYNC_EVERY_MINUTES: 15,
};
