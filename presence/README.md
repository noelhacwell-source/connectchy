# Presence markers

Each file in this folder is one copy of Connectchy that has run on someone's
computer. The dashboard's **currently online** counter is simply the number of
`*.json` files here.

- A marker is created once per install by `.github/workflows/presence.yml`.
- It holds only a version string and the date it first appeared.
- It is removed when that copy shuts down cleanly.
- The marker name is a hash of a random local install id. No account, IP
  address, machine name or person is stored anywhere.

Stale markers (a computer that was switched off without a clean stop) can be
removed by deleting their file. Deleting a marker never affects anyone's data.
