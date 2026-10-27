# Historical chain — excluded from db reset

008 is superseded and MUST NOT be applied. These files are evidence only; only migrations/ is executable. Mapping describes physical correspondence, not proof identical SQL ran.

| File | SHA256 | Live correspondence |
|---|---|---|
| 001_initial_schema.sql | 72b1bbdfd1ac948932f63a291aaa7ff31dee653dde08dde8be07b34b6c0ad900 | Partial: live profiles/scans/settlements exist; hole_scores and contest_groups do not. |
| 002_contest_sharing_draft.sql | 92a76d2fc51a0a56413a9b70e8bc0b635e586a9ebed97ca9a3e9b8939fd88572 | Partial: live contest sharing differs; see 20260326032639 create_contest_sharing_tables. |
| 003_live_share.sql | 30166819b1f9b5cf5191859f17d0587729108dbed719c1d86e49ea82324f608f | Applied as 20261022080416 live_share_slice1 (live catalog is authoritative). |
| 004_live_chat.sql | 3f949d54a9c24d7bcc7a3794381771a2b200cc806425fe1cd6180c1ce2bc7c5e | Applied as 20261022090542 live_chat_slice2. |
| 005_fix_contest_rls_recursion.sql | 35231e27454a10963b0be39083ba92c07e8746513525a5b92885db882345289c | Applied as 20261022090456 fix_contest_rls_recursion. |
| 006_course_data.sql | 5c30b7a8d2609c2a447f0167274f31cc58ed57aa551aff54a4f8e80a194e6b8d | Physical course tables exist; absent from live ledger. |
| 007_course_data_pm_edits.sql | b50648bf61e99c5d918b1033be011970a205a591236fda974936495d86a362e0 | Physical PM edits exist; absent from live ledger. |
| 008_tournament_rounds.sql | 7f3bfac5063749e4047a7a82582bb3511858874a34118b035480aac178bd9103 | Never applied. Superseded; MUST NOT APPLY. Rewrite for live in M3. |
