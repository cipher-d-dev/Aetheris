# 🛰️ Aetheris

**Aetheris** is a decentralized, serverless communication node designed to function in environments where traditional internet infrastructure is unreliable, censored, or non-existent.

By turning every mobile device into a relay node, Aetheris creates a resilient peer-to-peer mesh network that uses **Store-Carry-Forward (SCF)** logic to move messages across physical space.

---

## 🚀 The Vision

Aetheris isn't just a chat app; it’s an exploration of **Sovereign Connectivity**.

* **No Servers:** No central authority to shutdown or monitor traffic.
* **No Accounts:** Your identity is tied to cryptographic hardware, not an email or phone number.
* **Infrastructure-less:** Communicates via Bluetooth Low Energy (BLE) and Wi-Fi Direct.

---

## 🛠️ Technical Architecture

### 🛡️ Security & Identity

* **Hardware-Backed Identity:** Node identities are generated using **Ed25519** elliptic curve cryptography (via `libsodium`).
* **Secure Storage:** Private keys are stored in the **Android Keystore** / **iOS Secure Enclave** using `react-native-keychain`, ensuring keys never leave the device.
* **End-to-End Encryption:** Messages are encrypted at the source using **X25519 + ChaCha20-Poly1305**, making relay nodes "blind" to the content they carry.

### 📡 Networking (Hybrid Mesh)

* **Discovery Layer:** Uses **BLE (Bluetooth Low Energy)** advertising and scanning for low-power peer detection.
* **Data Layer:** High-speed data exchange via **Wi-Fi Direct (P2P)** sockets.
* **Routing Strategy:** Implements a **Spray-and-Wait** multi-hop protocol to propagate messages through the mesh while preventing network congestion.

### 🗄️ Local-First Data

* **Persistence:** Powered by **Quick-SQLite** with **Write-Ahead Logging (WAL)** for high-concurrency performance.
* **Deduplication:** A robust "seen-message" cache prevents relay loops and redundant storage.

---

## 💻 Tech Stack

* **Framework:** React Native (0.76+) with New Architecture (TurboModules)
* **Native Logic:** Kotlin (Android) / Swift (iOS)
* **Database:** Quick-SQLite
* **State Management:** Zustand
* **Cryptography:** libsodium (react-native-sodium)

---

## 🚧 Project Status: Day 1+ (In Development)

Currently focused on the Android implementation:

* [x] **Identity Generation:** Ed25519 keypair generation and Keystore integration.
* [x] **Local Persistence:** Schema definition and SQLite initialization.
* [x] **Native Bridge:** Kotlin `MeshNativeModule` for hardware access.
* [ ] **BLE Discovery:** (In Progress) Implementation of peer scanning and advertising.
* [ ] **Data Transfer:** (Planned) Wi-Fi Direct socket implementation.

---

## ⚙️ Development Setup

### Prerequisites

* Android NDK (Side-by-side)
* CMake 3.10+
* React Native CLI

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/aetheris.git

# Install dependencies
npm install

# Build the project
npx react-native run-android

```

---

## 🛡️ License

Distributed under the MIT License. See `LICENSE` for more information.

---

**Built with 💻 by cipher-d-dev.**
*Exploring the boundaries of resilient communication.*