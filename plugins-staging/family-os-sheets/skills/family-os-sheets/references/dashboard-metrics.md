# Dashboard Metrics

Dashboard calculations must follow these definitions.

| Metric | Definition |
| --- | --- |
| 本月收入 | posted `finance_transactions` with `type = income` and transaction date in the current month |
| 本月支出 | posted `finance_transactions` with `type = expense` and transaction date in the current month |
| 本月儲蓄 | 本月收入 minus 本月支出 |
| 現金資產 | sum of latest snapshots for accounts with `include_in_cash_assets = TRUE` |
| 本月待辦 | open, in-progress, or waiting tasks due in the current month |
| 逾期事項 | tasks where `is_overdue = TRUE` |
| 低庫存物品 | inventory items where `is_low_stock = TRUE` |
| BB 重要日期 | incomplete baby tasks within the configured lookahead |
| 工人相關提醒 | incomplete helper tasks and caregiver contracts within the configured lookahead |
| 租約 / 置業提醒 | expiring lease documents and incomplete property tasks within the configured lookahead |
| 快到期文件 | documents where `is_expiring_soon = TRUE` |

Transfers do not count as household expenses. Property scenarios use current dashboard cash assets, monthly income, and monthly expenses as planning inputs.
