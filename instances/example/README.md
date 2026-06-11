# Example Instance Scaffold

This folder is a committed template for one Family OS tenant.

Operational files for a real tenant should live alongside this shape, but should not be committed:

- `.env`
- `secrets/local-bot-config.json`
- `secrets/local-api-config.json`
- `config/reminder-config.json`
- `config/telegram-runtime.json`
- any real persona file with private family details

Copy these committed templates when bootstrapping a real tenant:

- `.env.example` -> `.env`
- `config/telegram-runtime.example.json` -> `config/telegram-runtime.json`
- `config/reminder-config.example.json` -> `config/reminder-config.json`
- `config/persona.example.yaml` -> `config/persona.yaml`

## Suggested runtime layout

```text
instances/{tenant}/
  .env
  config/
    telegram-runtime.json
    reminder-config.json
    persona.yaml
  secrets/
    local-bot-config.json
    local-api-config.json
  state/
  logs/
  memory/
  runtime/
    knowledge/
  skills_private/
  skills_pending/
```

## Notes

- `telegram-runtime.json` is the key file for isolating runtime knowledge per household.
- The current Phase 1 bot runtime still shares core code and staged skills from the repo.
- `persona.example.yaml` is only a template. Real family-specific persona files should stay private.
