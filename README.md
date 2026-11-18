# Aetheris

**Offline messaging that hops from phone to phone.**

No internet, no cell signal, no servers, no accounts. Every phone running Aetheris is also a relay: your message jumps across nearby phones until it reaches the person you sent it to, by the shortest path available.

## How it works

1. **Finding people.** Phones find each other over Bluetooth and connect automatically. When it can, the link upgrades itself to Wi‑Fi for speed. This uses Google's Nearby Connections, so it needs no internet.
2. **Finding the route.** Every few seconds each phone tells its neighbours who it can reach and in how many hops. From that, every phone works out the next hop on the **shortest path** to everyone in the mesh. If a phone walks away, the routes heal around it.
3. **When there's no route yet.** The message waits on your phone, and a few copies are handed to people you meet. It's delivered when a route appears or when someone carrying it walks into range of the recipient.
4. **Privacy.** Messages are end-to-end encrypted. The phones relaying them can't read them. Your identity is a key pair stored on your device; there's no phone number or email.

You get a delivery receipt (double tick ✓✓) when the message arrives. Long-press a message to see the route it took.

## Features

- 1:1 and group chats
- Photos (auto-compressed) and voice notes
- Sent / delivered ticks, plus the route each message took
- **Mesh** tab showing who's in range and who's reachable through other phones (with hop counts)
- Keeps relaying in the background
- Battery modes: Performance / Balanced / Saver
- Display names

## Run it

You need Android Studio (SDK + NDK), Node 18+, and **2 or more Android phones** with Google Play Services (Android 7+). The Android emulator can't do Bluetooth.

```bash
npm install
npx react-native run-android
```

Install it on each phone, open it, and allow the "Nearby devices" / location and notification permissions.

## Test the multi-hop relay

1. Put phone **A** and phone **C** far apart, out of range of each other (different floors or ~100 m+), with phone **B** in between.
2. Wait for the Mesh tab on A to show C under *Through the mesh · 2 hops*.
3. Send a message from A to C. It should show ✓✓, and long-pressing it should show `You → B → C`.
4. **Store-carry-forward:** turn C off, send from A, carry B over to C, and turn C on. The message is delivered and the receipt comes back the same way.

## Limits

- **Android only for now.** iPhones don't support Nearby Connections. An iOS version would need Apple's Multipeer Connectivity and would only talk to other iPhones.
- **Range:** about 30–100 m per hop, depending on walls and phones.
- **Mesh size:** built for a few to a few dozen phones. Routes are capped at 16 hops.
- **Attachments** are capped at ~300 KB, because every relay has to carry them.
- Display names are chosen by each person and aren't verified. Identities (keys) are.

## Code map

| Path | What's there |
|---|---|
| `src/mesh/` | The mesh brain: routing table, forwarding, receipts. Plain TypeScript, fully simulated in tests |
| `src/store/meshService.ts` | Connects the radio, the mesh, the database and the UI |
| `src/crypto/` | Ed25519 identity and signatures, X25519 + XSalsa20‑Poly1305 encryption (libsodium) |
| `src/db/` | SQLite storage |
| `src/screens/` | UI |
| `android/.../NearbyMeshManager.kt` | Radio: discovery, connections, sending bytes |
| `android/.../MediaHelper.kt` | Photo compression, voice recording and playback |

## Tests

```bash
npm test
```

The tests simulate meshes of up to 14 phones (including random layouts checked against true shortest paths), links breaking, offline carry-and-deliver, lost receipts and forged messages. They also run one relay end to end with real libsodium, and the app's service layer against real SQLite.

---

MIT License · Built by cipher-d-dev
