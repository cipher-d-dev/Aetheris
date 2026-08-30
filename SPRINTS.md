# Aetheris — Sprint Plan

> Iterations are ordered by dependency and risk. Each sprint builds on the last.
> Trivial items are batched into polish sprints. Non-trivial items each get their own focused sprint.

---

## Sprint 1 — Polish & Wiring (Trivial Backlog)
**Goal:** Close out all the "already half-done" items. No new architecture, just connecting existing wires.

| # | Task | Files Touched | Notes |
|---|------|---------------|-------|
| 1.1 | Routing path display in ChatScreen | `ChatScreen.tsx` | `message.routing.hops` already exists — render as a collapsible inline component |
| 1.2 | Message deletion UI | `ChatScreen.tsx`, `MessagesScreen.tsx` | `dbDeleteConversation()` exists — add long-press context menu |
| 1.3 | BT off / permission denied states in NearbyScreen | `NearbyScreen.tsx` | `ScanState` already has `'denied'` and `'bt_off'` — fill in the UI branches |
| 1.4 | Alias display in chat | `ChatScreen.tsx`, `MessagesScreen.tsx` | `sender.alias` is in the message schema — populate on send, display in UI |

**Definition of Done:** All 4 items shipped, no regressions in existing send/receive flow.

---

## Sprint 2 — Reliability: ACK & Delivery Confirmation
**Goal:** Make message delivery status trustworthy end-to-end, including across hops.

**Why non-trivial:** ACKs need to be routed back to the original sender through the mesh, not just sent directly. The ACK itself is a MeshMessage that travels in reverse.

| # | Task | Files Touched | Notes |
|---|------|---------------|-------|
| 2.1 | Wire up ACK send on message delivery | `meshService.ts` | Call `buildAck()` (already exists) immediately after `openMessage()` succeeds |
| 2.2 | Handle incoming ACK in receive pipeline | `meshService.ts`, `messagesStore.ts` | Detect `type === 'ACK'`, extract `ackedMessageId`, call `updateStatus(id, 'delivered')` |
| 2.3 | Relay ACKs through the mesh | `messageRelay.ts` | ACKs must pass through `decideMessageFate()` like normal messages — verify TTL and routing work correctly for reverse-path messages |
| 2.4 | Persist delivery status across restarts | `db/messages.ts` | Ensure `UPDATE messages SET status = 'delivered'` is durable, not just in-memory Zustand |
| 2.5 | UI — delivered tick vs sent tick in ChatScreen | `ChatScreen.tsx` | Single tick = sent, double tick = delivered (ACK received) |

**Definition of Done:** On a 2-device test, sender sees status go `pending → sent → delivered` after recipient receives the message.

---

## Sprint 3 — Discovery Hardening: Wi-Fi Direct MAC Resolution
**Goal:** Replace the fragile device-name-matching hack with a reliable BLE → Wi-Fi Direct MAC mapping.

**Why non-trivial:** BLE advertisement payload is 31 bytes. Fitting an additional 6-byte MAC alongside the existing node ID requires careful payload redesign or a secondary exchange protocol.

| # | Task | Files Touched | Notes |
|---|------|---------------|-------|
| 3.1 | Redesign BLE manufacturer data payload | `BLEManager.kt` | Current: `[version(1)] [nodeId(8)]`. New: `[version(1)] [nodeId(8)] [wifiMac(6)]` = 15 bytes — fits within limit |
| 3.2 | Parse Wi-Fi MAC from BLE scan results | `AetherisModule.kt` | Extract MAC in `parsePeerIdFromResult()`, pass it alongside peerId in `AetherisPeerDiscovered` event |
| 3.3 | Update `NativePeer` type and bridge | `AetherisBridge.ts` | Add `wifiMac?: string` to `NativePeer` interface |
| 3.4 | Store MAC in peers table | `db/database.ts`, `schema.ts` | Add `wifi_mac TEXT` column to `peers` table |
| 3.5 | Use stored MAC in `connectToPeer()` | `NearbyScreen.tsx`, `meshService.ts` | Pass MAC through when initiating Wi-Fi Direct connection — no more name matching |
| 3.6 | Fallback: Wi-Fi Direct peer list scan | `WifiDirectManager.kt` | Keep `getMacForPeerId()` as a fallback but make it secondary |

**Definition of Done:** Connection to a peer succeeds consistently without relying on device name matching. Verified on 2 devices with non-default device names.

---

## Sprint 4 — Multi-Device Integration Testing
**Goal:** Prove the Spray-and-Wait relay actually works across 3+ physical devices.

**Why non-trivial:** This is a distributed systems debugging exercise. No central logs. Failures can be in BLE, Wi-Fi Direct, routing logic, crypto, or timing — and they interact.

| # | Task | Notes |
|---|------|-------|
| 4.1 | Set up 3-device test rig | Device A ↔ Device B ↔ Device C. A and C are not in direct range (simulated by disabling direct connection). Message must hop through B. |
| 4.2 | Add structured logging to relay path | `messageRelay.ts`, `meshService.ts` | Log `[RELAY] msgId hop N: A→B→C` to console with timestamps. Capture with `adb logcat`. |
| 4.3 | Verify TTL and hop chain integrity | Manual check that `routing.hops` reflects the actual path taken |
| 4.4 | Verify deduplication under re-encounter | Walk Device B back into range of A after C has already delivered — confirm no duplicate delivery |
| 4.5 | Document failure modes found | Update this file with any bugs discovered and fixed |

**Definition of Done:** A message sent from Device A reaches Device C with Device B as relay, confirmed by delivery ACK (Sprint 2) and correct hop chain in logs.

---

## Sprint 5 — Performance & Battery Tuning
**Goal:** Make Aetheris viable as a background service without draining the battery.

**Why non-trivial:** BLE scan duty cycling, Wi-Fi Direct wake locks, and foreground service behaviour interact in ways that require real device profiling, not guesswork.

| # | Task | Files Touched | Notes |
|---|------|---------------|-------|
| 5.1 | Profile baseline battery drain | Android Battery Historian | Measure before any changes. Establish baseline mAh/hour. |
| 5.2 | BLE scan duty cycling | `BLEManager.kt` | Switch from `SCAN_MODE_LOW_POWER` to a manual on/off duty cycle (e.g. 5s scan, 25s sleep) when no peers have been seen recently |
| 5.3 | Wi-Fi Direct: disconnect when idle | `WifiDirectManager.kt` | Drop TCP connections after N minutes of inactivity, reconnect on-demand when a message needs sending |
| 5.4 | Message coalescing | `meshService.ts` | Batch multiple pending messages into a single TCP write rather than one frame per message |
| 5.5 | Wake lock audit | `AetherisService.kt` | Ensure the foreground service holds only the minimum required wake lock |
| 5.6 | Profile after changes | Android Battery Historian | Compare against baseline. Target: < 5% battery/hour in background scan mode. |

**Definition of Done:** Measurable improvement vs baseline. Background scanning runs for 1 hour with < 5% battery consumption on a mid-range device.

---

## Sprint 6 — Peer Trust System
**Goal:** Define and implement what "trust" means in the Aetheris model, then build it.

**Why non-trivial:** Requires a design decision before a single line of code. Trust could mean: affects routing priority, affects whether we relay their messages, affects UI filtering, or all three. Wrong choice here shapes the protocol permanently.

| # | Task | Notes |
|---|------|-------|
| 6.1 | Define trust semantics | Decision: trusted peers get priority relay slots. Untrusted peers: messages are still relayed but deprioritised. No message filtering (censorship-resistance is a core value). |
| 6.2 | Trust management UI | `SettingsScreen.tsx` or new `PeerDetailScreen` — mark/unmark peers as trusted, view trust history |
| 6.3 | Trust-aware relay selection | `messageRelay.ts` — weight `selectRandomPeers()` to prefer trusted peers when available |
| 6.4 | Persist and sync trust state | `db/database.ts` — `is_trusted` column already exists, wire it up |
| 6.5 | Trust revocation | Ability to untrust a peer — immediately deprioritise in relay selection |

**Definition of Done:** User can mark a peer as trusted. Trusted peers are visually differentiated and get relay priority. Untrusting a peer takes effect immediately.

---

## Sprint 7 — Group Messaging
**Goal:** Support sending a message to a named group of peers.

**Why non-trivial:** The current protocol is strictly 1:1 (single encrypted payload per message). Groups require either one payload per member (multicast) or a shared group key. Multicast is simpler but scales poorly. Shared keys are efficient but require key distribution, which is hard without a server.

**Chosen approach: Multicast (one message per member).** Simpler, preserves forward secrecy, no key distribution problem. Groups are local metadata only.

| # | Task | Files Touched | Notes |
|---|------|---------------|-------|
| 7.1 | Group data model | `src/types/message.ts`, `schema.ts` | New `groups` table: `id, name, member_ids (JSON), created_at` |
| 7.2 | Group creation UI | New `NewGroupScreen.tsx` | Select peers from known peers list, name the group |
| 7.3 | Group send in meshService | `meshService.ts` | `sendMessage()` accepts optional `groupId`, fans out one encrypted message per member |
| 7.4 | Group message display | `MessagesScreen.tsx`, `ChatScreen.tsx` | Group conversations show group name, display sender alias per message |
| 7.5 | Group member management | `src/db/` | Add/remove members, view member list |

**Definition of Done:** User can create a group with 2+ peers, send a message, and all members receive it independently decrypted.

---

## Sprint 8 — iOS Port
**Goal:** Bring Aetheris to iOS with full feature parity.

**Why non-trivial:** This is a near-complete rewrite of the native layer. CoreBluetooth, Multipeer Connectivity, and the iOS Secure Enclave all behave differently from their Android counterparts. Expect 4–6x the effort of any Android sprint.

| # | Task | Notes |
|---|------|-------|
| 8.1 | CoreBluetooth peripheral + central | Swift equivalent of `BLEManager.kt` — peripheral mode for advertising, central mode for scanning. Note: iOS apps cannot advertise in background without entitlement. |
| 8.2 | Multipeer Connectivity data transport | Swift equivalent of `WifiDirectManager.kt` — MCSession replaces TCP sockets. Protocol framing stays the same. |
| 8.3 | iOS Secure Enclave key storage | Replace `react-native-keychain` Android Keystore path with Secure Enclave backed storage on iOS |
| 8.4 | React Native TurboModule bridge (Swift) | Wire up `AetherisModule` equivalent in Swift/Objective-C, exposing the same JS API as the Kotlin module |
| 8.5 | Background execution entitlements | `uses-bluetooth-le-accessory`, `bluetooth-central` background modes. Note: iOS heavily restricts background BLE — document limitations clearly. |
| 8.6 | Cross-platform test | Android device ↔ iOS device message exchange |

**Definition of Done:** An iOS device running Aetheris can discover, connect to, and exchange encrypted messages with an Android device.

---

## Backlog (No Sprint Yet)

| Item | Reason deferred |
|------|----------------|
| Push-style delivery notifications | Requires OS notification integration — straightforward but low priority until ACKs work |
| Message expiry cleanup job | Cron-style job to delete expired rows from `messages` and `seen_message_ids` — simple but non-urgent |
| Onboarding flow | First-run experience explaining the mesh model to new users |
| App icon + splash screen | Visual polish, post-feature-complete |

---

## Sprint Summary

| Sprint | Theme | Effort | Risk |
|--------|-------|--------|------|
| 1 | Polish & wiring | Low | Low |
| 2 | ACK / delivery confirmation | Medium | Medium |
| 3 | Wi-Fi Direct MAC resolution | Medium | Medium |
| 4 | Multi-device integration testing | Medium | High |
| 5 | Battery & performance tuning | Medium | Medium |
| 6 | Peer trust system | Low–Medium | Low |
| 7 | Group messaging | High | Medium |
| 8 | iOS port | Very High | High |
