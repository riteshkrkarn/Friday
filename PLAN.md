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
   - Types: hackathon, project, task, achievement, bill, income.
   - Fields: title, type, deadline or due date, amount (bills and income), status, notes, created date.
   - Bills: recurring or one-time, with amount and due date.
   - Income: expected amount and expected date (for example, salary or stipend).
   - Can be searched and filtered by type, status, and date.

3. **Reminders**
   - Daily check of upcoming deadlines.
   - Reminder before each deadline (time before is configurable).
   - Update reminders: after a project or win is saved, remind you to update your resume or portfolio. Monitors items that are done but not yet updated.
   - Bill reminders: a set number of days before each bill is due.
   - Income reminders: a note when expected money is due to arrive, and a flag if it is late.
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

## Later (out of v1)

- **Achievement prompts:** After a win or project, ask whether to add it to your resume or portfolio.
- **Discussion:** Talk about projects, career, workload, and schedule using saved items.
- **Schedule generation:** Build a daily or weekly plan from your deadlines and tasks. It suggests time blocks, for example "Mon 10am to 12pm: finish hackathon demo."

## Out of scope (decided)

- Portfolio and resume export.
- Local models.

## Finance (proposed for v1, needs your confirmation)

- You add bills and income by voice or text. No bank login in v1.
- Do not store bank passwords, card numbers, or account numbers.
- Privacy: the cloud model (NVIDIA NIM) receives the text you send it. Finance details will go to that cloud service. Confirm you are fine with this, or we can route finance questions to a local model later.

## Decisions

- Speech engine: Whisper first, Deepgram if Whisper is too slow. Pick whichever works better after testing.
- Repeat threshold for suggested rules: 3.
- Reminder email: riteshkumarkarn414@gmail.com (to confirm, the address ends in "gmail" with no ".com" in your message).
- Learned rules: always confirm with you before acting.

## Open Questions

- Confirm the hotkey works on your laptop (test script: hotkey_test.py).
- Confirm the reminder email address above.
- Confirm the Telegram bot setup, if used as fallback.
- Move schedule generation into v1, or keep it later?

## Next Steps

1. Confirm the hotkey test.
2. Design the item store (SQLite table and tool).
3. Build the capture flow (hotkey, speech, save).
4. Build the daily reminder and update-reminder jobs.
5. Build the personalized morning brief.
6. Build the repetition tracker.
7. Write tests for the cloud key change.