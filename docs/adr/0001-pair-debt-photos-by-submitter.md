---
status: accepted
---

# Debt Photos are paired by Submitter, not by Station

A Debt Visit is assembled from two Photos — a Vehicle Photo and a Pump Photo —
that Zalo delivers as two independent webhook events milliseconds apart, with
different message ids and no field linking them. We pair them on the **Submitter
and the moment they arrived**, because that is the only fact both arrivals are
guaranteed to agree on: it is fixed before any AI reads anything, whereas the
Station is a conclusion each Photo reaches separately and can reach differently.

## Considered Options

- **By Station (what we had).** Both halves start from the Submitter's registered
  Station, but only the Pump Photo can read the Station off the printed plate and
  correct itself. The Vehicle Photo has no plate to read, so the two halves end on
  different Stations whenever the fill is photographed anywhere other than the
  Submitter's registered Station — and each opens its own Debt Visit. This was not
  an occasional race; it was deterministic.
- **By Zalo message id.** The obvious answer, and wrong: a single message a worker
  sends arrives as several events, each with its own `msg_id`. There is no
  correlation identifier in the payload. Anyone who proposes this again should
  check a real multi-photo delivery before assuming otherwise.

## Consequences

- **The Station becomes a conclusion, not an identity.** A Photo joining an
  existing Debt Visit must never change its Station — _except_ a Pump Photo that
  read a Station off its printed plate, which always overrides. This is safe
  because inherited guesses cannot disagree with each other (both halves ask the
  same question of the same Submitter), so plate-versus-guess is the only conflict
  that can arise.
- **The Vehicle Photo branch must not write the Station of a Visit it joins.**
  Under a Station key that overwrite was merely redundant; under a Submitter key
  it turns a correct plate-derived Station back into a stale registered one, which
  would defeat the pairing entirely. It reads like harmless symmetry — it is not.
- **Submitter spans both intake doors.** Zalo sends and in-app uploads use one
  namespaced value, so the two can never collide and an absent Submitter can never
  match another absent Submitter.
  - _Amendment, 2026-08-20:_ the in-app door (`/upload`) was retired — photos now
    arrive through Zalo only, so `zalo:` is the sole namespace written from here on.
    The decision stands unchanged: `app:`-keyed Visits already in the table keep
    pairing correctly, and the namespacing is what lets both eras coexist in one
    column. `SubmitterDoor` keeps its `'app'` variant for exactly that reason.
- **The global pairing advisory lock is still required.** Pairing on the Submitter
  removes the disagreement, not the race: both halves still arrive concurrently
  and would each see "no open visit" without it.
- **The window keeps its five minutes.** Under this key its only remaining job is
  to stop one Submitter's two _different_ fills from merging.
