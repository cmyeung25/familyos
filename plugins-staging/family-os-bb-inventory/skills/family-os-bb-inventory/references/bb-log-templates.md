# BB Log Templates

Use the smallest valid BB log event.

## Feeding

- `log_type = feeding`
- default `log_subtype = milk` when the user says 飲奶 without a more precise subtype
- ask `幾多 ml` when amount is missing

## Diaper

- `log_type = diaper`
- ask `小便 / 大便 / 兩樣` when subtype is missing

## Sleep

- `log_type = sleep`
- record the time the user clearly states

## Temperature

- `log_type = temperature`
- use `unit = celsius`

## Note

- `log_type = note`
- use only for simple BB notes that do not fit a narrower type

## Vaccination

- `log_type = vaccination`
- put the identifying detail such as vaccine name in `description`
- ask only for the minimum missing identifying fact, such as the date or vaccine name when needed

## Clinic Visit

- `log_type = clinic_visit`
- put the narrow visit note in `description`
- keep the visit note narrow; do not widen into symptom journaling

## Doctor Visit

- `log_type = doctor_visit`
- put the narrow visit note in `description`
- keep the visit note narrow; do not widen into symptom or medicine journaling
