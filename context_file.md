# QRAttendance (CampusTrack) — AI Context File

## What This Project Is

A cross-platform attendance management system built with **React Native + Expo**. It supports three user roles — **Student**, **Lecturer**, and **Admin** — each with a fully separate dashboard. Attendance is taken via **QR code scanning** (primary) or **NFC card** (admin-managed, desktop-only).

The app targets both **mobile** (iOS/Android) and **web** from a single codebase. The web version is used primarily by admins and lecturers on desktop; the mobile version is used primarily by students for scanning QR codes.

---

## Tech Stack

| Concern | Technology |
|---|---|
| Framework | Expo SDK 54, Expo Router v6 (file-based routing) |
| Language | TypeScript (React Native 0.81.5, React 19) |
| Backend | Firebase — Auth + Firestore only (no Storage, no Functions) |
| Auth persistence | `@react-native-async-storage/async-storage` (mobile), default web persistence |
| Navigation | Expo Router `Stack` (all screens in a single flat stack) |
| QR scanning | `expo-camera` → `CameraView` + `onBarcodeScanned` |
| QR generation | `react-native-qrcode-svg` |
| NFC | `nfc-pcsc` Node.js companion server (see `nfc-server/`) |
| Excel export | `xlsx` |
| Icons | `@expo/vector-icons` → `Ionicons` |

---

## Repository Layout

```
QRAttendance/
├── app/
│   ├── _layout.tsx              Root Stack layout; wraps everything in UserProvider
│   ├── index.tsx                Auth guard — redirects to role dashboard or LoginScreen
│   └── screens/
│       ├── auth/
│       │   ├── LoginScreen.tsx
│       │   ├── RegisterStudent.tsx
│       │   ├── RegisterLecturer.tsx
│       │   └── RegisterAdmin.tsx
│       ├── admin/
│       │   ├── Dashboard.tsx
│       │   ├── ManageUsers.tsx
│       │   ├── ManageCourses.tsx
│       │   ├── NFC.tsx          Admin NFC card enrollment UI
│       │   ├── Reports.tsx
│       │   ├── Notifications.tsx
│       │   └── Profile.tsx
│       ├── lecturer/
│       │   ├── Dashboard.tsx
│       │   ├── MyCourses.tsx
│       │   ├── CreateCourse.tsx
│       │   ├── Attendance.tsx   Entry point — lists courses for attendance
│       │   ├── AttendanceSession.tsx  Course picker before starting a session
│       │   ├── ActiveSession.tsx      Live QR display + attendee list + timer
│       │   ├── Reports.tsx
│       │   ├── Notifications.tsx
│       │   └── Profile.tsx
│       └── student/
│           ├── Dashboard.tsx
│           ├── MyCourses.tsx
│           ├── SearchCourse.tsx  Enroll / unenroll request flow
│           ├── ScanQR.tsx        Camera QR scanner
│           ├── MyAttendance.tsx
│           ├── Notifications.tsx
│           └── Profile.tsx
├── components/
│   ├── Sidebar.tsx              Role-aware left nav; handles logout; shows unread badge
│   ├── ProfilePhotoPicker.tsx   Image picker + base64 save to Firestore
│   └── OfflineBanner.tsx        NetInfo offline indicator
├── context/
│   └── UserContext.tsx          Global auth state — userData, setUserData, userLoading
├── hooks/
│   └── useResponsive.ts         Reactive { isWeb, isLandscape, width, height }
├── sessionManager.ts            30-min inactivity auto-logout via AsyncStorage timestamps
├── firebase.js                  Firebase init; AsyncStorage persistence on mobile
├── nfc-server/
│   ├── server.js                Express + nfc-pcsc companion server (port 3333)
│   └── package.json
├── app.json                     Expo config (name: "CampusTrack")
└── app-example/                 Unused Expo scaffold — can be deleted
```

---

## Firestore Collections & Document Shapes

### `users/{uid}`
```ts
{
  uid: string,
  role: 'student' | 'lecturer' | 'admin',
  firstName: string,
  lastName: string,
  email: string,
  phoneNumber: string,
  department: string,
  college: string,
  profilePhoto: string | null,   // base64 data URI stored directly in Firestore

  // Student-only
  matricNumber: string,
  gender: string,

  // Lecturer-only
  title: string,                 // e.g. "Dr.", "Prof."
  staffId: string,
}
```

### `courses/{courseId}`
```ts
{
  courseTitle: string,
  courseCode: string,
  level: string,                 // e.g. "100", "200"
  semester: string,              // e.g. "First", "Second"
  session: string,               // e.g. "2024/2025"
  lecturerId: string,            // uid of owning lecturer
  lecturerName: string,
  department: string,
  college: string,
  enrolledStudents: string[],    // array of student UIDs
  createdAt: Timestamp,
}
```

### `sessions/{sessionId}`
```ts
{
  courseId: string,
  courseTitle: string,
  courseCode: string,
  lecturerId: string,
  status: 'active' | 'closed',
  startTime: Timestamp,
  endTime: Timestamp | null,
  duration: number,              // seconds
  qrExpiry: number,              // Unix ms — when the current QR token expires
}
```

### `sessions/{sessionId}/attendees/{docId}` (subcollection)
```ts
{
  studentId: string,
  studentName: string,
  matricNumber: string,
  courseId: string,
  sessionId: string,
  timestamp: Timestamp,
  method: 'QR' | 'NFC',
}
```

### `attendance/{docId}` (flat copy for reporting)
```ts
{
  studentId: string,
  studentName: string,
  matricNumber: string,
  courseId: string,
  sessionId: string,
  lecturerId: string,
  timestamp: Timestamp,
  method: 'QR' | 'NFC',
  status: 'present',
}
```

### `notifications/{docId}`
```ts
{
  userId: string,                // student/lecturer UID, or 'admin' for admin notifications
  title: string,
  body: string,
  read: boolean,
  status: 'pending' | 'approved' | 'rejected',  // used for admin enroll requests
  type: string,                  // e.g. 'enroll_request', 'session_started'
  createdAt: Timestamp,

  // Enroll-request specific
  studentId?: string,
  studentName?: string,
  courseId?: string,
  courseName?: string,
}
```

---

## Auth & Session Flow

1. **`app/index.tsx`** — On mount: calls `checkSessionTimeout()`, then `onAuthStateChanged`. If logged in, reads `users/{uid}` to get `role`, then redirects:
   - `admin` → `/screens/admin/Dashboard`
   - `lecturer` → `/screens/lecturer/Dashboard`
   - `student` → `/screens/student/Dashboard`
   - Not logged in → `/screens/auth/LoginScreen`

2. **`context/UserContext.tsx`** — Provides `{ userData, setUserData, userLoading }` globally. `userData` is the full Firestore user document merged with `{ uid }`. Screens import `useUser()` to access it.

3. **`sessionManager.ts`** — 30-minute inactivity timer. Uses `AsyncStorage` key `lastActiveTime`. On any user activity call `resetInactivityTimer()`. On `AppState` change to `active`, calls `checkSessionTimeout()`. Auto-logout calls `signOut(auth)` then navigates to LoginScreen.

---

## QR Attendance Flow (Core Feature)

### Lecturer side (`ActiveSession.tsx`)
1. Lecturer taps "Start Session" on a course → navigates to `ActiveSession` with params: `courseId`, `courseTitle`, `courseCode`, `enrolledCount`, optional `existingSessionId`.
2. If `existingSessionId` is provided, restores the existing active session from Firestore.
3. Otherwise, creates a new doc in `sessions/` with `status: 'active'`.
4. A QR code is generated every N minutes (default 5, lecturer can customise). The QR payload is:
   ```json
   { "sessionId": "...", "courseId": "...", "expires": 1234567890000 }
   ```
5. A countdown timer runs. When it hits 0, the QR auto-refreshes (new expiry). Lecturer can also manually refresh.
6. Real-time `onSnapshot` on `sessions/{id}/attendees` shows the live attendee list.
7. Lecturer ends the session → `status` set to `'closed'`, `endTime` recorded. Absent students are written to `attendance` with `status: 'absent'`. Optional Excel export via `xlsx`.

### Student side (`ScanQR.tsx`)
1. Opens `CameraView` with `barcodeTypes: ['qr']`.
2. On scan: parses JSON payload, checks:
   - `expires > Date.now()` (not expired)
   - Session doc exists and `status === 'active'`
   - Student's UID is in `courses/{courseId}.enrolledStudents`
   - No existing doc in `sessions/{id}/attendees` where `studentId == uid`
3. On pass: writes to both `sessions/{id}/attendees` and flat `attendance` collection.
4. Web browser shows a "Camera not available" message — scanning is mobile-only.

---

## NFC Flow (Admin, Desktop/Web only)

The NFC system is a **separate Node.js server** (`nfc-server/server.js`) that must be run by the admin on their PC alongside the web app.

- **Reader**: ACR122U USB NFC reader via `nfc-pcsc`
- **Card type**: MIFARE Classic 1K (default Key A: `FF FF FF FF FF FF`)
- **Data block**: Block 4 (sector 1, first data block) — stores the student's matric number as a UTF-8 string padded to 16 bytes
- **Server**: `http://localhost:3333`

Endpoints:
| Method | Path | Purpose |
|---|---|---|
| GET | `/status` | Is the reader connected? |
| GET | `/nfc/read` | Long-poll (60s) — reads block 4 when card is placed |
| POST | `/nfc/write` | Long-poll (60s) — writes `{ data: matricNumber }` to block 4 |
| GET | `/nfc/verify?expected=xxx` | Long-poll (30s) — reads and checks against expected matric |

The admin UI (`app/screens/admin/NFC.tsx`) calls these endpoints. No auth token on the server — it is LAN-only companion software.

---

## Responsive Layout Pattern

Every screen follows this pattern:
```tsx
const { isWeb } = useResponsive();  // reactive to window resize

return (
  <View style={{ flex: 1, flexDirection: 'row' }}>
    {(isWeb || sidebarOpen) && <Sidebar role="..." userName="..." activeRoute="..." />}
    <View style={{ flex: 1 }}>
      {/* top bar with hamburger on mobile */}
      {!isWeb && <TouchableOpacity onPress={() => setSidebarOpen(!sidebarOpen)} />}
      {/* main content */}
    </View>
    {/* mobile overlay to close sidebar */}
    {sidebarOpen && !isWeb && <TouchableOpacity onPress={() => setSidebarOpen(false)} />}
  </View>
);
```

- `isWeb` = `window.width > 768px` (computed reactively via `useResponsive`)
- On web: Sidebar is always visible, no hamburger menu
- On mobile: Sidebar slides in as an absolute overlay; a semi-transparent backdrop closes it
- Brand colour: `#2C3E7A` (dark blue). Secondary green: `#27AE60`. Error red: `#E74C3C`.

---

## Known Inconsistencies / Tech Debt

1. **Static `isWeb` at module level** — several screens declare `const isWeb = Dimensions.get('window').width > 768` at the top of the file (static, computed once). Other screens use `useResponsive()` (reactive). StyleSheet references that use the static `isWeb` won't update on window resize. Prefer `useResponsive()` everywhere.

2. **No TypeScript interfaces for data models** — `userData`, course objects, session objects, etc. are all typed `any`. There are no shared type definitions.

3. **`userData` duplication** — some dashboards call `onAuthStateChanged` + `getDoc` locally instead of using `useUser()`. This means two separate Firestore reads for the same data. `useUser()` should be the single source of truth.

4. **Profile photos stored as base64 in Firestore** — large base64 strings inflate document sizes. Firebase Storage would be the correct approach but is not currently used.

5. **`app-example/`** — unused Expo scaffold directory, safe to delete.

6. **Firebase config in source** — `firebase.js` has the API key hardcoded. Not an immediate security risk for Firestore (security rules should be the gate), but consider `.env` or Firebase App Check for production.

---

## Running the Project

```bash
# Install dependencies
npm install

# Start Expo dev server
npm start        # or: npx expo start

# Run on specific platform
npm run android
npm run ios
npm run web

# Run NFC companion server (admin PC only)
cd nfc-server
npm install
node server.js   # listens on http://localhost:3333
```

---

## Environment / Config

- App name: **CampusTrack** (set in `app.json`)
- Bundle ID: configured in `app.json`
- Firebase project: `qr-attendance-app-a494d`
- All Firebase config values are in `firebase.js` (no `.env` file)
- TypeScript config: `tsconfig.json` (standard Expo setup, path alias `@/` maps to project root)
- ESLint: `eslint.config.js` using `eslint-config-expo`
