# Telegram UAT Cases

These cases are intended for live Telegram verification after a bot rollout.

## Gary

### Checkup

1. Query the next checkup
   - Message: `下次產檢`
   - Expected:
     - replies in a clear Dobby-like tone
     - returns the next checkup date and time when available
     - does not mention irrelevant BB log actions

2. Query the next checkup with a natural sentence
   - Message: `嚟緊幾時再做產檢？`
   - Expected:
     - same result as `下次產檢`
     - wording can vary, but the time should stay correct

### Reminder

3. Create a reminder for another person
   - Message: `多比多比，你幫我提太太15分鐘後飲水`
   - Expected:
     - records a reminder for `太太`
     - reply mentions the target person correctly
     - later proactive reminder should go to the intended recipient

4. Create a self reminder
   - Message: `提我今晚11點收衫`
   - Expected:
     - owner should resolve to the sender
     - reply confirms the time in Cantonese

5. Query upcoming tasks
   - Message: `未來幾日有咩 task 要做？`
   - Expected:
     - lists upcoming tasks clearly
     - does not invent missing tasks

### Inventory

6. Query what needs restocking
   - Message: `屋企而家有咩要補貨？`
   - Expected:
     - lists low-stock or expired items
     - tone sounds like Dobby
     - does not claim an item is fine when it is expired

7. Query what to buy in a looser shopping phrasing
   - Message: `屋企有咩要買`
   - Expected:
     - ideally still returns an inventory-oriented shopping answer
     - if it drifts into unrelated task reminders or old shopping tasks, record it as a routing defect

8. Record usage
   - Message: `又用咗一卷廁紙`
   - Expected:
     - decrements the correct inventory item
     - reply states the remaining quantity if available

9. Record a purchase
   - Message: `啱啱買咗一支牛奶`
   - Expected:
     - increments the correct inventory item
     - does not confuse purchase with consumption

## Brother

### Reminder

1. Create a household reminder
   - Message: `提我聽朝8點帶鎖匙`
   - Expected:
     - reply has a Doraemon-like helpful butler feel
     - time is normalized correctly

2. Query upcoming reminders
   - Message: `未來幾日有咩 task 要做？`
   - Expected:
     - lists tasks clearly
     - does not mention BB logs

### Inventory

3. Query what needs buying
   - Message: `屋企而家有咩要補貨？`
   - Expected:
     - lists low-stock items
     - tone sounds like 多啦B夢, not 多比

4. Record usage
   - Message: `用多咗一盒紙巾`
   - Expected:
     - updates the correct stock item
     - reply remains practical and in character

## Quick Regression Checks

1. `/bridgehealth`
   - Expected:
     - bridge reports ready
     - provider shows `deepseek`

2. `/reset`
   - Expected:
     - clears chat state without crashing the bot

3. `/whoami`
   - Expected:
     - returns the Telegram user ID
