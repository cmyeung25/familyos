# Query Recipes

| Natural-language request | Read or write path |
| --- | --- |
| 今個月家庭支出幾多？ | Sum posted expense rows in `finance_transactions`; group by `category` if requested. |
| 有咩 task 已經逾期？ | Filter `tasks.is_overdue = TRUE`. |
| 用咗 10 片尿片。 | Fast append `inventory_movements`: `itm_diaper`, `movement_type=consume`, `quantity_delta=-10`, plus `audit_log`. |
| 買咗 3 罐初生奶粉。 | Fast append `inventory_movements`: `itm_formula`, `movement_type=purchase`, `quantity_delta=3`, plus `audit_log`. |
| 用咗一罐奶粉。 | Fast append `inventory_movements`: `itm_formula`, `movement_type=consume`, `quantity_delta=-1`, plus `audit_log`. |
| 記錄 BB 今日 07:30 飲奶 90 ml。 | Fast append `baby_log`: `per_baby`, `log_type=feeding`, `log_subtype=milk`, `description=BB 飲奶 90 ml`, `value_number=90`, `unit=ml`, `remarks=由自然語言即時記錄`, plus `audit_log`; read back and compare with the feeding canonical template. |
| 下星期有咩重要事項？ | Filter incomplete tasks by due date; include baby, helper, medical, document, and property categories. |
| 工人有咩需要跟進？ | Read helper tasks, `caregivers`, and open `caregiver_records`. |
| 最近睇過哪些樓盤？ | Filter `properties` by `visit_date` and show asking price, saleable area, and calculated price per sqft. |
| 哪些文件快到期？ | Filter `documents.is_expiring_soon = TRUE`. |
| BB 有咩健康紀錄？ | Read `baby_log` health-related types and state the date range used. |
| 屋企而家有幾多庫存？ | Fast read `dashboard!A39:H55`. |
| 現金流是否足夠支持買樓？ | Read dashboard cash flow and `property_scenarios`; clearly label the answer as a planning estimate. |

When a request is ambiguous, use the safest narrow interpretation and state it. Ask only when the missing value would make a write incorrect.
