# Second Me: Product Plan

## Goal
A personal assistant that sits beside you. It remembers your projects, hackathons, deadlines, and achievements. It reminds you about what is due, what needs updating, and what you keep repeating.

## Base
- OpenJarvis (open source, Apache 2.0), running on your Windows laptop.
- Cloud model: NVIDIA NIM (your current setup).

## v1 Features (in scope)

1. **Quick capture by voice**
   - Tap Right Ctrl twice to start recording (key is configurable).
   - Speech is converted to text. Try local Whisper first. If it is too slow, switch to Deepgram. Use whichever works better after testing.
   - The item is saved to the store.
   - Fallback: send the same text through Telegram.

2. **Item store**
   - Types: hackathon, project, task, achievement.
   - Fields: title, type, deadline or due date, status, notes, created date.
   - Can be searched and filtered by type, status, and date.

3. **Reminders**
   - Daily check of upcoming deadlines.
   - Reminder before each deadline (time before is configurable).
   - Update reminders: after a project or win is saved, remind you to update your resume or portfolio. Monitors items that are done but not yet updated.
   - Delivery order: email first, then Telegram, then the Jarvis web interface.

4. **Personalized reports (all of them)**
   - Morning brief and every other report use your saved items, priorities, and preferences.
   - Example: the brief lists today's deadlines first, then pending updates, then open tasks.
   - You can tell it what you want included or removed, and it remembers.

5. **Learns from repetition**
   - Tracks things you say or ask for again and again.
   - After a repeat (for example, 3 times), it proposes a rule or shortcut. Example: "You often save hackathons on Mondays. Want a Monday reminder to check new ones?"
   - It asks before acting on a new rule. You can accept, change, or reject it.
   - Rule: it never takes an action without your confirmation.

6. **Model**
   - NVIDIA NIM through the existing backend key setup.
   - Engine stays swappable, so other providers can be added later.

7. **Tests**
   - Tests for the cloud key setup (backend, not frontend).

## Later / v2 (out of v1)

- **Finance (bills & income):** Add bills (recurring or one-time, amount, due date) and income (expected amount, expected date, late flag) by voice or text. No bank login, no bank passwords/card numbers/account numbers. Route finance questions to a local model or confirm cloud privacy before enabling.
- **Achievement prompts:** After a win or project, ask whether to add it to your resume or portfolio.
- **Discussion:** Talk about projects, career, workload, and schedule using saved items.
- **Schedule generation:** Build a daily or weekly plan from your deadlines and tasks. It suggests time blocks, for example "Mon 10am to 12pm: finish hackathon demo."

## Out of scope (decided)

- Portfolio and resume export.
- Local models (for v1).

## Decisions

- Speech engine: Whisper first, Deepgram if Whisper is too slow. Pick whichever works better after testing.
- Repeat threshold for suggested rules: 3.
- Reminder email: riteshkumarkarn414@gmail.com (confirmed).
- Telegram is the fallback capture and reminder channel (confirmed).
- Schedule generation stays in "Later" (confirmed).
- Hotkey: Right Ctrl double-tap works on Windows (confirmed).
- Finance (bills & income): deferred to v2 (confirmed).
- Learned rules: always confirm with you before acting.

## Open Questions

- Telegram bot setup: needs a bot token from BotFather when we build the fallback.

## Next Steps

1. Write tests for the cloud key setup (backend).
2. Design and build the item store (SQLite table, tool, and API).
3. Build the capture flow (hotkey, speech, save, Telegram fallback).
4. Build the daily reminder and update-reminder jobs.
5. Build the personalized morning brief.
6. Build the repetition tracker.