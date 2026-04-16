/**
 * NFC.tsx — Admin NFC Card Registration
 *
 * Flow:
 *   1. Admin searches for a student and selects them
 *   2. App calls GET /nfc/read — waits silently until card is placed, reads UID
 *   3. Shows card UID — admin reviews and confirms
 *   4. App calls POST /nfc/link — waits for card again, reads UID, saves to Firestore
 *   5. Done — nfcUid stored on student document
 *
 * No writing to the card. No verify step. UID is read-only hardware ID.
 * Requires nfc-server/server.js running on localhost:3333.
 */

import Sidebar from "@/components/Sidebar";
import { useUser } from "@/context/UserContext";
import { useResponsive } from "@/hooks/useResponsive";
import { Ionicons } from "@expo/vector-icons";

import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../../firebase";

const isWeb = Dimensions.get("window").width > 768;
const NFC_SERVER = "http://localhost:3333";
const STATUS_POLL_MS = 3000;

// ─── Types ────────────────────────────────────────────────────────────────────

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  matricNumber: string;
  department?: string;
  level?: string;
  nfcUid?: string;
  nfcRegisteredAt?: any;
};

type ReaderStatus = "checking" | "disconnected" | "connected";

type FlowStep =
  | "search" // pick a student
  | "waiting-read" // waiting for card to be placed (read UID)
  | "review" // show UID — admin decides
  | "waiting-link" // waiting for card again to confirm link
  | "done" // success
  | "error"; // something went wrong

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiStatus() {
  const res = await fetch(`${NFC_SERVER}/status`, {
    signal: AbortSignal.timeout(5000),
  });
  return res.json() as Promise<{ connected: boolean; readerName: string }>;
}

async function apiRead(signal: AbortSignal) {
  const res = await fetch(`${NFC_SERVER}/nfc/read`, { signal });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Read failed");
  return data as { rawData: string; uid: string };
}

async function apiLink(matric: string, signal: AbortSignal) {
  const res = await fetch(`${NFC_SERVER}/nfc/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matric }),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Link failed");
  return data as { success: boolean; uid: string; matric: string };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminNFCRegistration() {
  const { userData } = useUser();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isWeb } = useResponsive();
  const [readerStatus, setReaderStatus] = useState<ReaderStatus>("checking");
  const [readerName, setReaderName] = useState("");

  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentRegistrations, setRecentRegistrations] = useState<Student[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [step, setStep] = useState<FlowStep>("search");
  const [scannedUid, setScannedUid] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = useCallback(() => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.12,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1.0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.current.start();
  }, []);

  const stopPulse = useCallback(() => {
    pulseLoop.current?.stop();
    pulse.setValue(1);
  }, []);

  useEffect(() => {
    if (step === "waiting-read" || step === "waiting-link") startPulse();
    else stopPulse();
    return stopPulse;
  }, [step]);

  // ─── Reader polling ─────────────────────────────────────────────────────

  const pollStatus = useCallback(async () => {
    try {
      const { connected, readerName: name } = await apiStatus();
      setReaderStatus(connected ? "connected" : "disconnected");
      if (connected) setReaderName(name);
      else setReaderName("");
    } catch {
      setReaderStatus("disconnected");
      setReaderName("");
    }
  }, []);

  useEffect(() => {
    pollStatus();
    const t = setInterval(pollStatus, STATUS_POLL_MS);
    return () => clearInterval(t);
  }, []);

  // ─── Students ───────────────────────────────────────────────────────────

  const fetchStudents = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("role", "==", "student")),
      );
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Student));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStudents(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "users"),
      where("role", "==", "student"),
      where("nfcUid", "!=", null),
      orderBy("nfcRegisteredAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setRecentRegistrations(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Student)
          .filter((s) => !!s.nfcUid)
          .slice(0, 8),
      );
    });
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStudents();
  };

  // ─── Flow ───────────────────────────────────────────────────────────────

  const cancelAndReset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStep("search");
    setSelectedStudent(null);
    setScannedUid("");
    setSearchQuery("");
    setErrorMessage("");
  };

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student);
    setScannedUid("");
    setErrorMessage("");
    doRead(student);
  };

  const doRead = async (_student?: Student) => {
    setStep("waiting-read");
    setScannedUid("");
    setErrorMessage("");
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await apiRead(ctrl.signal);
      setScannedUid(result.uid);
      setStep("review");
    } catch (err: any) {
      if (err.name === "AbortError") return;
      // Auto-retry on connect errors — stay on waiting screen
      const isConnectError =
        err.message?.includes("Connect failed") ||
        err.message?.includes("sharing");
      if (isConnectError) {
        // Wait 500ms then try again silently
        await new Promise((r) => setTimeout(r, 500));
        doRead(_student);
        return;
      }
      setErrorMessage(err.message || "Failed to read card.");
      setStep("error");
    }
  };

  const handleLink = async () => {
    if (!selectedStudent || !scannedUid) return;

    // Check if this UID is already linked to a different student
    const existingOwner = students.find(
      (st) => st.nfcUid === scannedUid && st.id !== selectedStudent.id,
    );

    if (existingOwner) {
      const ownerName = `${existingOwner.firstName} ${existingOwner.lastName}`;
      const ownerMatric = existingOwner.matricNumber || "N/A";
      const newName = `${selectedStudent.firstName} ${selectedStudent.lastName}`;

      const doOverwrite = async () => {
        // Clear UID from old owner first
        try {
          await updateDoc(doc(db, "users", existingOwner.id), {
            nfcUid: deleteField(),
          });
          // Then proceed with normal link
          await proceedLink();
        } catch (err: any) {
          setErrorMessage(err.message || "Failed to overwrite card.");
          setStep("error");
        }
      };

      if (Platform.OS === "web") {
        const ok = window.confirm(
          `⚠ Card already registered\n\n` +
            `This card (UID: ${scannedUid}) is currently linked to:\n` +
            `${ownerName} (${ownerMatric})\n\n` +
            `Do you want to overwrite and link it to ${newName} instead?`,
        );
        if (ok) doOverwrite();
        else setStep("review"); // back to review step, no action
      } else {
        Alert.alert(
          "Card Already Registered",
          `This card is currently linked to:\n${ownerName} (${ownerMatric})\n\nOverwrite and link it to ${newName} instead?`,
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => setStep("review"),
            },
            { text: "Overwrite", style: "destructive", onPress: doOverwrite },
          ],
        );
      }
      return;
    }

    await proceedLink();
  };

  const proceedLink = async () => {
    if (!selectedStudent || !scannedUid) return;
    setStep("waiting-link");
    setErrorMessage("");
    try {
      await updateDoc(doc(db, "users", selectedStudent.id), {
        nfcUid: scannedUid,
        // clean up old fields if they exist
        nfcCardId: deleteField(),
        nfcEnrolledAt: deleteField(),
        nfcRegistered: deleteField(),
        nfcRegisteredAt: deleteField(),
      });
      setStudents((prev) =>
        prev.map((st) => {
          // Update the new owner
          if (st.id === selectedStudent.id)
            return { ...st, nfcUid: scannedUid };
          // Clear the old owner's card if it was overwritten
          if (st.nfcUid === scannedUid) return { ...st, nfcUid: undefined };
          return st;
        }),
      );
      setStep("done");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save to Firestore.");
      setStep("error");
    }
  };

  // ─── Derived ────────────────────────────────────────────────────────────

  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      (s.matricNumber || "").toLowerCase().includes(q) ||
      (s.department || "").toLowerCase().includes(q)
    );
  });

  const totalRegistered = students.filter((s) => !!s.nfcUid).length;
  const totalPending = students.length - totalRegistered;

  if (loadingStudents) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#2C3E7A" />
      </View>
    );
  }

  // ─── Reader gate ─────────────────────────────────────────────────────────

  if (readerStatus === "checking") {
    return (
      <GateScreen
        isWeb={isWeb}
        sidebarOpen={sidebarOpen}
        onMenu={() => setSidebarOpen(!sidebarOpen)}
        userData={userData}
      >
        <ActivityIndicator size="large" color="#2C3E7A" />
        <Text style={s.gateTitle}>Checking for NFC Reader…</Text>
        <Text style={s.gateSub}>Connecting to localhost:3333</Text>
      </GateScreen>
    );
  }

  if (readerStatus === "disconnected") {
    return (
      <GateScreen
        isWeb={isWeb}
        sidebarOpen={sidebarOpen}
        onMenu={() => setSidebarOpen(!sidebarOpen)}
        userData={userData}
      >
        <View style={s.gateIconBg}>
          <Ionicons name="wifi-outline" size={40} color="#E74C3C" />
        </View>
        <Text style={s.gateTitle}>NFC Reader Not Found</Text>
        <Text style={s.gateSub}>
          Make sure the ACR122U is plugged in and the server is running:
        </Text>
        <View style={s.codeBlock}>
          <Text style={s.codeText}>cd nfc-server</Text>
          <Text style={s.codeText}>node server.js</Text>
        </View>
        <Text style={s.gateRetrying}>Retrying every 3 seconds…</Text>
        <TouchableOpacity style={s.retryBtn} onPress={pollStatus}>
          <Ionicons name="refresh-outline" size={16} color="#2C3E7A" />
          <Text style={s.retryBtnText}>Retry Now</Text>
        </TouchableOpacity>
      </GateScreen>
    );
  }

  // ─── Main UI ─────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      {(isWeb || sidebarOpen) && (
        <Sidebar
          role="admin"
          userName={
            userData ? `${userData.firstName} ${userData.lastName}` : "Admin"
          }
          activeRoute="/screens/admin/NFC"
        />
      )}

      <View style={s.content}>
        {/* Top bar */}
        <View style={s.topBar}>
          {!isWeb && (
            <TouchableOpacity
              style={s.menuButton}
              onPress={() => setSidebarOpen(!sidebarOpen)}
            >
              <Ionicons
                name={sidebarOpen ? "close" : "menu"}
                size={24}
                color="#2C3E7A"
              />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>NFC Card Registration</Text>
            <View style={s.readerRow}>
              <View style={s.readerDot} />
              <Text style={s.readerName} numberOfLines={1}>
                {readerName}
              </Text>
            </View>
          </View>
          {step !== "search" && (
            <TouchableOpacity style={s.cancelBtn} onPress={cancelAndReset}>
              <Ionicons name="close" size={15} color="#E74C3C" />
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#2C3E7A"]}
              tintColor="#2C3E7A"
            />
          }
        >
          <View style={s.body}>
            {/* ── SEARCH ──────────────────────────────────────────────── */}
            {step === "search" && (
              <>
                {/* Stats */}
                <View style={s.statsRow}>
                  {[
                    {
                      icon: "people-outline",
                      num: students.length,
                      lbl: "Students",
                      color: "#2C3E7A",
                    },
                    {
                      icon: "checkmark-circle-outline",
                      num: totalRegistered,
                      lbl: "Registered",
                      color: "#2C3E7A",
                    },
                    {
                      icon: "time-outline",
                      num: totalPending,
                      lbl: "Pending",
                      color: "#E67E22",
                    },
                  ].map((item) => (
                    <View key={item.lbl} style={s.statCard}>
                      <Ionicons
                        name={item.icon as any}
                        size={20}
                        color={item.color}
                      />
                      <Text style={[s.statNum, { color: item.color }]}>
                        {item.num}
                      </Text>
                      <Text style={s.statLbl}>{item.lbl}</Text>
                    </View>
                  ))}
                </View>

                {/* Instruction */}
                <View style={s.instructionCard}>
                  <View style={s.instructionIcon}>
                    <Ionicons name="card-outline" size={22} color="#2C3E7A" />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.instructionTitle}>
                      How registration works
                    </Text>
                    <Text style={s.instructionText}>
                      Select a student → place their NFC card on the reader →
                      the app reads the card's unique ID and links it to their
                      profile. No data is written to the card.
                    </Text>
                  </View>
                </View>

                {/* Search */}
                <View style={s.searchBar}>
                  <Ionicons name="search-outline" size={18} color="#999" />
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search by name or matric number…"
                    placeholderTextColor="#999"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery("")}>
                      <Ionicons name="close-circle" size={18} color="#999" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Student list */}
                <View style={s.listCard}>
                  {filteredStudents.length === 0 ? (
                    <View style={s.emptyState}>
                      <Ionicons
                        name="people-outline"
                        size={40}
                        color="#D0D0D0"
                      />
                      <Text style={s.emptyText}>
                        {searchQuery
                          ? `No students match "${searchQuery}"`
                          : "No students found"}
                      </Text>
                    </View>
                  ) : (
                    (() => {
                      // Group by Level → Department
                      const grouped: Record<string, Record<string, any[]>> = {};
                      filteredStudents.forEach((st) => {
                        const level = st.level
                          ? `${st.level} Level`
                          : "Unspecified Level";
                        const dept = st.department || "Unspecified Program";
                        if (!grouped[level]) grouped[level] = {};
                        if (!grouped[level][dept]) grouped[level][dept] = [];
                        grouped[level][dept].push(st);
                      });

                      // Sort levels (numeric ascending, Unspecified last)
                      const sortedLevels = Object.keys(grouped).sort((a, b) => {
                        if (a === "Unspecified Level") return 1;
                        if (b === "Unspecified Level") return -1;
                        return parseInt(a) - parseInt(b);
                      });

                      return sortedLevels.map((level) => (
                        <View key={level} style={{ marginBottom: 12 }}>
                          <View style={s.groupLevelHeader}>
                            <Ionicons
                              name="school-outline"
                              size={14}
                              color="#2C3E7A"
                            />
                            <Text style={s.groupLevelText}>{level}</Text>
                          </View>
                          {Object.keys(grouped[level])
                            .sort()
                            .map((dept) => {
                              const studentsInGroup = grouped[level][dept].sort(
                                (a, b) =>
                                  `${a.firstName} ${a.lastName}`.localeCompare(
                                    `${b.firstName} ${b.lastName}`,
                                  ),
                              );
                              return (
                                <View key={dept} style={{ marginTop: 8 }}>
                                  <View style={s.groupDeptHeader}>
                                    <Ionicons
                                      name="business-outline"
                                      size={12}
                                      color="#666"
                                    />
                                    <Text style={s.groupDeptText}>{dept}</Text>
                                    <Text style={s.groupCount}>
                                      {studentsInGroup.length}
                                    </Text>
                                  </View>
                                  {studentsInGroup.map((student, idx) => (
                                    <TouchableOpacity
                                      key={student.id}
                                      style={[
                                        s.studentRow,
                                        idx < studentsInGroup.length - 1 &&
                                          s.studentRowBorder,
                                      ]}
                                      onPress={() =>
                                        handleSelectStudent(student)
                                      }
                                    >
                                      <View style={s.avatar}>
                                        <Text style={s.avatarText}>
                                          {(
                                            student.firstName?.[0] || "?"
                                          ).toUpperCase()}
                                        </Text>
                                      </View>
                                      <View style={s.studentInfo}>
                                        <Text style={s.studentName}>
                                          {student.firstName} {student.lastName}
                                        </Text>
                                        <Text style={s.studentSub}>
                                          {student.matricNumber}
                                        </Text>
                                      </View>
                                      {student.nfcUid ? (
                                        <View style={s.regBadge}>
                                          <Ionicons
                                            name="checkmark-circle"
                                            size={13}
                                            color="#27ae60"
                                          />
                                          <Text style={s.regBadgeText}>
                                            Registered
                                          </Text>
                                        </View>
                                      ) : (
                                        <View style={s.pendBadge}>
                                          <Ionicons
                                            name="time-outline"
                                            size={13}
                                            color="#E67E22"
                                          />
                                          <Text style={s.pendBadgeText}>
                                            Pending
                                          </Text>
                                        </View>
                                      )}
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              );
                            })}
                        </View>
                      ));
                    })()
                  )}
                </View>

                {/* Recent */}
                {recentRegistrations.length > 0 && (
                  <View style={{ gap: 10 }}>
                    <Text style={s.sectionTitle}>Recently Registered</Text>
                    {recentRegistrations.map((student) => (
                      <View key={student.id} style={s.recentCard}>
                        <View style={s.avatar}>
                          <Text style={s.avatarText}>
                            {(student.firstName?.[0] || "?").toUpperCase()}
                          </Text>
                        </View>
                        <View style={s.studentInfo}>
                          <Text style={s.studentName}>
                            {student.firstName} {student.lastName}
                          </Text>
                          <Text style={s.studentSub}>
                            {student.matricNumber}
                          </Text>
                          {student.nfcUid && (
                            <Text style={s.uidText}>{student.nfcUid}</Text>
                          )}
                        </View>
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color="#27ae60"
                        />
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* ── ACTIVE FLOW CARD ──────────────────────────────────────── */}
            {step !== "search" && (
              <View style={s.flowCard}>
                {/* Student banner */}
                {selectedStudent && (
                  <View style={s.studentBanner}>
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>
                        {(selectedStudent.firstName?.[0] || "?").toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.studentName}>
                        {selectedStudent.firstName} {selectedStudent.lastName}
                      </Text>
                      <Text style={s.studentSub}>
                        {selectedStudent.matricNumber}
                        {selectedStudent.department
                          ? ` · ${selectedStudent.department}`
                          : ""}
                      </Text>
                    </View>
                    {selectedStudent.nfcUid && (
                      <View style={s.regBadge}>
                        <Ionicons
                          name="checkmark-circle"
                          size={12}
                          color="#27ae60"
                        />
                        <Text style={s.regBadgeText}>Already registered</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* ── WAITING FOR READ ──────────────────────────────── */}
                {step === "waiting-read" && (
                  <NfcWait
                    pulse={pulse}
                    color="#2C3E7A"
                    title="Waiting for Card…"
                    hint="Place the student's NFC card flat on the ACR122U reader"
                  >
                    <ActivityIndicator size="large" color="#fff" />
                  </NfcWait>
                )}

                {/* ── REVIEW ────────────────────────────────────────── */}
                {step === "review" && selectedStudent && scannedUid && (
                  <>
                    <View style={s.divider} />
                    <Text style={s.sectionLabelSm}>CARD DETECTED</Text>

                    <View style={s.uidBox}>
                      <View style={s.uidBoxHeader}>
                        <Ionicons
                          name="card-outline"
                          size={18}
                          color="#2C3E7A"
                        />
                        <Text style={s.uidBoxTitle}>
                          Card UID (hardware ID)
                        </Text>
                      </View>
                      <Text style={s.uidValue}>{scannedUid}</Text>
                      <Text style={s.uidNote}>
                        This is the card's permanent hardware identifier.
                        {selectedStudent.nfcUid
                          ? " This student already has a card registered — linking will replace it."
                          : " No card is currently linked to this student."}
                      </Text>
                    </View>

                    <View style={s.divider} />
                    <Text style={s.sectionLabelSm}>WILL BE LINKED TO</Text>
                    <View style={s.linkPreview}>
                      <Ionicons
                        name="person-outline"
                        size={18}
                        color="#2C3E7A"
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={s.linkPreviewName}>
                          {selectedStudent.firstName} {selectedStudent.lastName}
                        </Text>
                        <Text style={s.linkPreviewMatric}>
                          {selectedStudent.matricNumber}
                        </Text>
                      </View>
                    </View>

                    <View style={s.reviewBtns}>
                      <TouchableOpacity
                        style={s.rescanBtn}
                        onPress={() => doRead(selectedStudent)}
                      >
                        <Ionicons
                          name="refresh-outline"
                          size={15}
                          color="#2C3E7A"
                        />
                        <Text style={s.rescanBtnText}>Re-scan Card</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          s.linkBtn,
                          !!selectedStudent.nfcUid && s.linkBtnOrange,
                        ]}
                        onPress={handleLink}
                      >
                        <Ionicons name="link-outline" size={15} color="#fff" />
                        <Text style={s.linkBtnText}>
                          {selectedStudent.nfcUid
                            ? "Re-link Card"
                            : "Link Card"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {/* ── SAVING ────────────────────────────────────────── */}
                {step === "waiting-link" && (
                  <View style={s.nfcArea}>
                    <ActivityIndicator size="large" color="#2C3E7A" />
                    <Text style={s.nfcTitle}>Saving to Firestore…</Text>
                  </View>
                )}

                {/* ── DONE ──────────────────────────────────────────── */}
                {step === "done" && selectedStudent && (
                  <View style={s.successArea}>
                    <Ionicons
                      name="checkmark-circle"
                      size={60}
                      color="#27ae60"
                    />
                    <Text style={s.successTitle}>Card Registered!</Text>
                    <Text style={s.successSub}>
                      Card successfully linked to student profile.
                    </Text>
                    <View style={s.successTable}>
                      <SRow
                        label="Student"
                        value={`${selectedStudent.firstName} ${selectedStudent.lastName}`}
                      />
                      <SRow
                        label="Matric No."
                        value={selectedStudent.matricNumber}
                      />
                      <SRow label="Card UID" value={scannedUid} mono />
                      <SRow label="Firestore" value="nfcUid saved ✓" />
                    </View>
                    <TouchableOpacity
                      style={s.anotherBtn}
                      onPress={cancelAndReset}
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={17}
                        color="#2C3E7A"
                      />
                      <Text style={s.anotherBtnText}>
                        Register Another Card
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ── ERROR ─────────────────────────────────────────── */}
                {step === "error" && selectedStudent && (
                  <View style={s.errorArea}>
                    <Ionicons name="close-circle" size={52} color="#E74C3C" />
                    <Text style={s.errorTitle}>Something went wrong</Text>
                    <Text style={s.errorMsg}>{errorMessage}</Text>
                    <View style={s.errorBtns}>
                      <TouchableOpacity
                        style={s.retryBtn2}
                        onPress={() => doRead(selectedStudent)}
                      >
                        <Ionicons
                          name="refresh-outline"
                          size={15}
                          color="#fff"
                        />
                        <Text style={s.retryBtn2Text}>Try Again</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.backBtn}
                        onPress={cancelAndReset}
                      >
                        <Text style={s.backBtnText}>Back to Search</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {sidebarOpen && !isWeb && (
        <TouchableOpacity
          style={s.overlay}
          onPress={() => setSidebarOpen(false)}
        />
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GateScreen({ isWeb, sidebarOpen, onMenu, userData, children }: any) {
  return (
    <View style={s.container}>
      {(isWeb || sidebarOpen) && (
        <Sidebar
          role="admin"
          userName={
            userData ? `${userData.firstName} ${userData.lastName}` : "Admin"
          }
          activeRoute="/screens/admin/NFC"
        />
      )}
      <View style={s.content}>
        <View style={s.topBar}>
          {!isWeb && (
            <TouchableOpacity style={s.menuButton} onPress={onMenu}>
              <Ionicons name="menu" size={24} color="#2C3E7A" />
            </TouchableOpacity>
          )}
          <Text style={s.headerTitle}>NFC Card Registration</Text>
        </View>
        <View style={s.gateContainer}>{children}</View>
      </View>
    </View>
  );
}

function NfcWait({
  pulse,
  color,
  title,
  hint,
  children,
}: {
  pulse: Animated.Value;
  color: string;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.nfcArea}>
      <Animated.View
        style={[
          s.nfcRing,
          { backgroundColor: color + "1E", transform: [{ scale: pulse }] },
        ]}
      >
        <View
          style={[s.nfcCore, { backgroundColor: color, shadowColor: color }]}
        >
          {children}
        </View>
      </Animated.View>
      <Text style={s.nfcTitle}>{title}</Text>
      <Text style={s.nfcHint}>{hint}</Text>
    </View>
  );
}

function SRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={sr.row}>
      <Text style={sr.label}>{label}</Text>
      <Text style={[sr.value, mono && sr.mono]}>{value}</Text>
    </View>
  );
}

const sr = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  label: { fontSize: 12, color: "#888", fontWeight: "600" },
  value: {
    fontSize: 13,
    color: "#2D3436",
    fontWeight: "700",
    flex: 1,
    textAlign: "right",
  },
  mono: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 11,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, flexDirection: "row", backgroundColor: "#F5F6FA" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F6FA",
  },
  content: { flex: 1, overflow: "hidden", minWidth: 0 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 24,
    paddingVertical: 12,
    paddingTop: isWeb ? 18 : 50,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    gap: 12,
    minHeight: isWeb ? 69 : 80,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#F5F6FA",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: isWeb ? 17 : 15,
    fontWeight: "bold",
    color: "#2C3E7A",
  },
  readerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  readerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#27ae60",
  },
  readerName: { fontSize: 11, color: "#27ae60", fontWeight: "600", flex: 1 },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E74C3C",
  },
  cancelBtnText: { color: "#E74C3C", fontWeight: "600", fontSize: 13 },

  gateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 14,
  },
  gateIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FDEDEC",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  gateTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2D3436",
    textAlign: "center",
  },
  gateSub: { fontSize: 13, color: "#666", textAlign: "center", lineHeight: 20 },
  codeBlock: {
    backgroundColor: "#1A1A2E",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 4,
    alignSelf: "stretch",
    marginHorizontal: 8,
  },
  codeText: {
    fontSize: 13,
    color: "#A8D8A8",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  gateRetrying: { fontSize: 12, color: "#aaa" },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#2C3E7A",
  },
  retryBtnText: { color: "#2C3E7A", fontWeight: "700", fontSize: 14 },

  body: { padding: 16, gap: 16 },

  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statNum: { fontSize: 22, fontWeight: "bold", color: "#2C3E7A" },
  statLbl: { fontSize: 11, color: "#888", textAlign: "center" },

  instructionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    backgroundColor: "#EEF2FF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#C5CAE9",
  },
  instructionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  instructionTitle: { fontSize: 13, fontWeight: "700", color: "#2C3E7A" },
  instructionText: { fontSize: 12, color: "#555", lineHeight: 18 },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#2D3436",
    outlineStyle: "none" as any,
  },

  listCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  groupLevelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#EEF2FF",
    borderRadius: 6,
    marginBottom: 4,
  },
  groupLevelText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2C3E7A",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  groupDeptHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: "#F5F6FA",
    borderRadius: 4,
  },
  groupDeptText: { fontSize: 12, fontWeight: "600", color: "#666", flex: 1 },
  groupCount: { fontSize: 11, color: "#999", fontWeight: "600" },
  studentRowBorder: { borderBottomWidth: 1, borderBottomColor: "#F5F6FA" },
  emptyState: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, color: "#aaa" },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#2C3E7A",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  studentInfo: { flex: 1, gap: 2 },
  studentName: { fontSize: 14, fontWeight: "700", color: "#2D3436" },
  studentSub: { fontSize: 12, color: "#888" },
  uidText: {
    fontSize: 10,
    color: "#aaa",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },

  regBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EAFAF1",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  regBadgeText: { fontSize: 11, color: "#27ae60", fontWeight: "700" },
  pendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF9E7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pendBadgeText: { fontSize: 11, color: "#E67E22", fontWeight: "700" },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2C3E7A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },

  flowCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  studentBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
    padding: 14,
  },
  divider: { height: 1, backgroundColor: "#F0F0F0" },
  sectionLabelSm: {
    fontSize: 10,
    fontWeight: "800",
    color: "#aaa",
    letterSpacing: 1.2,
  },

  nfcArea: { alignItems: "center", paddingVertical: 24, gap: 14 },
  nfcRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    justifyContent: "center",
    alignItems: "center",
  },
  nfcCore: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  nfcTitle: { fontSize: 16, fontWeight: "700", color: "#2D3436" },
  nfcHint: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    maxWidth: 270,
    lineHeight: 18,
  },

  uidBox: {
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#C5CAE9",
  },
  uidBoxHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  uidBoxTitle: { fontSize: 14, fontWeight: "700", color: "#2C3E7A" },
  uidValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#2C3E7A",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    letterSpacing: 1,
  },
  uidNote: { fontSize: 12, color: "#555", lineHeight: 17 },

  linkPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F5F6FA",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  linkPreviewName: { fontSize: 14, fontWeight: "700", color: "#2D3436" },
  linkPreviewMatric: {
    fontSize: 12,
    color: "#888",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },

  reviewBtns: { flexDirection: "row", gap: 10 },
  rescanBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2C3E7A",
  },
  rescanBtnText: { color: "#2C3E7A", fontWeight: "600", fontSize: 14 },
  linkBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "#2C3E7A",
  },
  linkBtnOrange: { backgroundColor: "#E67E22" },
  linkBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  successArea: { alignItems: "center", paddingVertical: 12, gap: 10 },
  successTitle: { fontSize: 22, fontWeight: "bold", color: "#27ae60" },
  successSub: { fontSize: 13, color: "#666", textAlign: "center" },
  successTable: {
    width: "100%",
    backgroundColor: "#F5F6FA",
    borderRadius: 12,
    padding: 14,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  anotherBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#2C3E7A",
    marginTop: 6,
    width: "100%",
  },
  anotherBtnText: { color: "#2C3E7A", fontWeight: "700", fontSize: 14 },

  errorArea: { alignItems: "center", paddingVertical: 12, gap: 10 },
  errorTitle: { fontSize: 18, fontWeight: "bold", color: "#E74C3C" },
  errorMsg: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 300,
  },
  errorBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  retryBtn2: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#2C3E7A",
  },
  retryBtn2Text: { color: "#fff", fontWeight: "700", fontSize: 14 },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  backBtnText: { color: "#666", fontWeight: "600", fontSize: 14 },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 10,
  },
});
