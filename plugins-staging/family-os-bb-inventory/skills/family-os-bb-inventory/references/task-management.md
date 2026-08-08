# Task Management

Use Telegram task support for lightweight household planning and reminders only.

## Supported Task Intent

- remember a dated task or appointment
- remember a shopping item not yet bought
- remember a future baby milestone, vaccine, or checkup
- remember a school-application or paperwork step
- query open / upcoming / overdue tasks
- update an existing task only when one target task is already clear
- cancel an existing task when one target task is already clear

## Person Scope

Use task person fields when the task clearly belongs to one person or is clearly about one person.

- `owner_person_id` = who mainly owns or should receive the reminder
- `related_person_id` = who the task is about

Known Family OS people ids:

- husband = `per_husband`
- wife = `per_wife`
- baby = `per_baby`

When the bridge provides sender identity hints:

- `提我`, `我自己`, or obvious self-care reminders such as drinking water:
  use the sender primary person id as `owner_person_id`
- if the reminder is also clearly about the same person:
  set `related_person_id` to the same id too
- `媽媽`, `老婆`, `太太`, or prenatal-check wording:
  set `related_person_id = per_wife`
- BB checkup / vaccine / school / baby planning:
  set `related_person_id = per_baby`

Examples:

- `提我今晚 9:30 飲水`
  use `owner_person_id = per_husband` when the sender identity is the husband
  use `related_person_id = per_husband` too
- `記低媽媽產檢 6 月 20 號 2 點半`
  use `related_person_id = per_wife`
- `提我下星期幫 BB 預約檢查`
  use the sender as `owner_person_id`
  use `related_person_id = per_baby`

If the task is household-shared and not clearly personal, it is fine to leave both person fields blank.

## Preferred Task Shapes

### Task-specific reminder hint

- keep one-off reminder hints in `tasks.remarks`
- when the user clearly says something like `提醒我記得戴口罩` or `提示：記得帶水樽`, preserve that wording in `remarks`
- prefer explicit markers such as `提醒：...` or `提示：...` so later query and reminder flows can extract the hint cleanly
- do not copy reusable hint rules into every task unless the user explicitly said this task itself needs that extra note

### Appointment / scheduled task

- use `append_task`
- include `due_at`
- category usually `medical`, `baby`, or `home`

Examples:

- `記低媽媽產檢 6 月 20 號 2 點半`
- `提我下星期幫 BB 預約檢查`

### Shopping backlog

- use `append_task`
- category usually `home`
- task name should say the buying intent directly
- if no exact time is given, keep it as an open task without inventing one

Examples:

- `淘寶想買奶樽刷`
- `記低要買 BB 濕紙巾`

### Future baby schedule

- prefer `append_bb_calendar_event` when the user gives a concrete future BB appointment that should appear in Google Calendar
- the Calendar API links the appointment back to a Family OS task by default, so the reminder worker can still use the task row
- use `append_task` only for lightweight future intentions that do not need a calendar event
- category usually `baby` or `medical`
- if the user gives a concrete due date, store it
- if the user only says a future intention without a date, store as open task and ask only if the date is necessary for the user's stated goal
- use `append_baby_log` for already-happened BB events, not future appointments

### School / application planning

- use `append_task`
- category usually `baby` or `home`
- keep task names concrete, for example `幫 BB 準備報讀學校資料`

## Query Rules

- when the reply would benefit from context hints, also read `get_task_context_hints`
- merge task-specific hints from `remarks` with reusable hints from `get_task_context_hints`
- show task-specific hints first, then reusable hints, and dedupe identical hint text

- `未來幾日 / 幾星期 / 幾個月有咩要做` -> `get_upcoming_tasks`
- `有咩未做` -> `query_tasks` with `status = open`
- `有咩過咗期未做` -> `get_overdue_tasks`
- if the user asks for a narrow subset such as only medical or only BB-related tasks, use `query_tasks` with category filters when needed

## Clarification Rules

Ask only when the missing fact changes the task meaning:

- the user mentions a date-like plan but the target event is too vague
- there are multiple possible existing tasks and the user wants to update one
- the user asks to mark something done or change time but no clear task target exists

When transcript context is available:

- read from the newest message backwards
- prefer the newest focused segment after any visible time gap
- infer whether the user is still adjusting the same task or has started a new topic
- if a short reply like `去產檢任務` clearly answers the active clarification from the newest segment, continue directly
- if the newest segment still leaves more than one plausible target task, ask one narrow follow-up

Do not ask unnecessary questions for simple backlog capture such as:

- `淘寶想買奶粉`
- `記低之後要幫 BB 報讀學校`

Those can be stored as open tasks immediately.

## Relative Dates And Corrections

- resolve `今日`, `聽日`, `聽朝`, `後日`, `下星期` against the current Hong Kong date shown by the bridge prompt
- if the user immediately follows with a correction like `係 6 月 9 號先啱`, `唔係呢個時間`, or `改返做 11:45`, treat it as an update to the most recent task write when there is one clear recent task
- when correcting one clear recent task, use `update_task` and change only the corrected field instead of creating a second task
- if several recent tasks could match the correction, ask which one
- if a same-turn recap query ran after the write, do not let that recap read replace the exact recent task target for the user's next immediate correction

## Adjustment Flow

- for cancel / reschedule / mark-done requests, first identify the target task safely
- if the bridge already provides one clear recent task entity that matches the user's immediate adjustment wording, update that exact `task_id` first
- if the bridge also provides a recent transcript window, use it to confirm that the user is still discussing that same task and not a newer topic after a time gap
- prefer `get_upcoming_tasks` when the user mentions a near-future task date
- or use `query_tasks` with supported filters such as `status`, `from`, and `to`
- do not rely on a free-text `query` field in the API payload
- once one target task is clear, use `update_task`
- for cancellation, set `status = cancelled`

## Recap Flow

- after `append_task`, recap the recorded task
- if the task has a due date, also recap that day's schedule after the write
- after `update_task`, recap what changed
- if the due date moved, recap both the old day schedule and the new day schedule
- after cancellation, recap the cancelled task and the original day's schedule after removal

## Output Style

- For successful writes, reply with what was recorded and include the time if one exists.
- For query replies, summarize clearly instead of dumping raw task rows.
- For task query replies, include at most 2 relevant hints per task when they materially help the user prepare.
- Keep the Dobby-like tone only in `reply_text`, not in payload design.
