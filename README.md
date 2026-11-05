# Calendar Sync

If you keep separate work and personal calendars, your coworkers can't see when you're busy with personal things, and your family can't see when you're in meetings. Calendar Sync copies busy time both ways as plain blocks, so everyone can see when you're available. It works with one or more work calendars.

It's a Google Apps Script project that runs inside your work Google Workspace account, so no private information is shared: your work calendar sees only free/busy from your personal calendars, your personal calendar gets time blocks without meeting titles, attendees or details, and nothing is sent anywhere outside Google Calendar. Each person runs their own copy; there's no server or shared app.

How it works:

- **Personal → work:** busy times from your personal calendars become "Busy" blocks on your work calendar. Only free/busy is read, never titles or details.
- **Work → personal:** your work meetings become "Work Meetings" blocks on a dedicated "Work Busy" calendar in your personal account.

Blocks have no reminders, show as busy, and are private. Every block is tagged, so the script never copies its own blocks (no loops) and never edits or deletes your real events.

By default it syncs from yesterday through 14 days ahead every 15 minutes, and skips all-day events, declined events, events marked "free", and Out of office / working location events.

## 1. Share the calendars

In your **personal** Google Calendar:

1. Create a new calendar called **Work Busy**.
2. Share **Work Busy** with your work address: **Make changes to events**.
3. Share each personal calendar that should block work time with your work address: **See only free/busy (hide details)**.
4. Note each calendar's ID (Settings → the calendar → *Integrate calendar*).

In your **work** account, accept the shares if prompted (or add each calendar via *Other calendars → Subscribe*).

If you get emails when the script adds blocks to Work Busy, turn off its email notifications in that calendar's settings.

## 2. Set up clasp

Signed in as your **work** account:

1. Turn on the Apps Script API: https://script.google.com/home/usersettings
2. Install clasp (pinned in `package.json`) and log in:

   ```sh
   npm install
   npm run login
   ```

3. Skip this step if `.clasp.json` already exists. Otherwise create your own project (this writes `.clasp.json`, which is gitignored because it points at your project):

   ```sh
   npx clasp create --type standalone --title "Calendar Sync" --rootDir src
   git checkout -- src/appsscript.json
   ```

   `clasp create` overwrites `src/appsscript.json` with a default manifest; the `git checkout` restores the repo's version, which enables the Calendar service and its scopes.

## 3. Configure and deploy

1. Create your config from the template and fill in your calendar IDs:

   ```sh
   cp Config.example.js src/Config.js
   ```

   `src/Config.js` is gitignored, but clasp still pushes it.
2. Optionally set `timeZone` in `src/appsscript.json` to your [time zone ID](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) (e.g. `America/New_York`). Blocks land at the right time either way; it only affects timestamps in the execution log.
3. Push:

   ```sh
   npm run push
   ```

4. Open the editor with `npm run open`.
5. Run **syncNow** once from the editor and approve the permissions. Your account will show an "unverified app" screen, which is normal for your own script: *Advanced → Go to Calendar Sync*.
6. Check the execution log, then run **installTrigger** to sync automatically.

## Day to day

- Change settings: edit `src/Config.js`, then `npm run push`. The trigger picks up the new code on its next run.
- Pause: run **uninstallTrigger**.
- Remove everything: run **removeAllBlocks**. It stops the trigger and deletes every block the script ever made, however old. With a lot of history it may stop after about 5 minutes; the log then says how many blocks are left, so run it again until it says "All blocks removed."
- Errors: Apps Script emails you failed-run summaries. Logs are under *Executions* in the editor.

## Notes

- `src/Config.js` and `.clasp.json` hold your personal settings and are gitignored, so they aren't backed up by git. If you lose them, recover both from the Apps Script project: `npx clasp clone <scriptId> --rootDir src` (the script ID is in the editor's URL), then `git checkout -- src/appsscript.json src/Sync.js` to keep the repo's versions of those files.
- Overlapping or back-to-back events are merged into one block.
- Several work accounts can share one Work Busy calendar: run a separate copy of the script in each, and give each copy a different `INSTANCE_NAME` in its `src/Config.js` so it only edits and removes its own blocks. Each copy can also use its own `PERSONAL_BLOCK_TITLE`. Before changing a copy's `INSTANCE_NAME`, run **removeAllBlocks** in it (then **installTrigger**); blocks made under the old name are otherwise left behind.
- If a personal calendar becomes unreadable (e.g. sharing removed), the run fails instead of deleting that calendar's blocks.

## License

[MIT](LICENSE). Provided as is, with no warranty. The script only edits or deletes the blocks it created itself, but you run it at your own risk.
