import Sidebar from "@/components/Sidebar";
import { useUser } from "@/context/UserContext";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { router } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../../firebase";

const isWeb = Dimensions.get("window").width > 768;

// ── Haversine distance in metres ──────────────────────────────────────────────
function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function ScanQR() {
  const { userData: studentData } = useUser();
  const [permission, requestPermission] = useCameraPermissions();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<
    "success" | "error" | "already" | "geo" | null
  >(null);
  const [message, setMessage] = useState("");
  const [distance, setDistance] = useState<number | null>(null); // metres away when geo fails

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || processing) return;
    setScanned(true);
    setProcessing(true);
    setDistance(null);

    try {
      const qrData = JSON.parse(data);
      const { sessionId, courseId, expires } = qrData;

      // ── 1. QR expiry ──────────────────────────────────────────────────────
      if (Date.now() > expires) {
        setResult("error");
        setMessage(
          "This QR code has expired. Ask your lecturer to refresh it.",
        );
        setProcessing(false);
        return;
      }

      // ── 2. Session active ─────────────────────────────────────────────────
      const sessionSnap = await getDoc(doc(db, "sessions", sessionId));
      if (!sessionSnap.exists() || sessionSnap.data().status !== "active") {
        setResult("error");
        setMessage("This attendance session is no longer active.");
        setProcessing(false);
        return;
      }
      const sessionData = sessionSnap.data();

      // ── 3. Course enrolment ───────────────────────────────────────────────
      const courseSnap = await getDoc(doc(db, "courses", courseId));
      if (!courseSnap.exists()) {
        setResult("error");
        setMessage("Course not found.");
        setProcessing(false);
        return;
      }
      const enrolledStudents: string[] =
        courseSnap.data().enrolledStudents || [];
      if (!enrolledStudents.includes(studentData?.uid)) {
        setResult("error");
        setMessage("You are not enrolled in this course.");
        setProcessing(false);
        return;
      }

      // ── 4. Geolocation check (only if lecturer enabled it) ────────────────
      if (sessionData.geoEnabled) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setResult("geo");
          setMessage(
            "Location permission is required to mark attendance for this session. " +
              "Please allow location access and try again.",
          );
          setProcessing(false);
          return;
        }

        let pos: Location.LocationObject;
        try {
          pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
        } catch {
          setResult("geo");
          setMessage(
            "Could not get your location. Make sure GPS is on and try again.",
          );
          setProcessing(false);
          return;
        }

        const dist = haversineMetres(
          pos.coords.latitude,
          pos.coords.longitude,
          sessionData.geoLat,
          sessionData.geoLng,
        );

        if (dist > sessionData.geoRadius) {
          setDistance(Math.round(dist));
          setResult("geo");
          setMessage(
            `You are ${Math.round(dist)} m away from the classroom. ` +
              `You must be within ${sessionData.geoRadius} m to mark attendance.`,
          );
          setProcessing(false);
          return;
        }
      }

      // ── 5. Duplicate check ────────────────────────────────────────────────
      const attendeesRef = collection(db, "sessions", sessionId, "attendees");
      const existingSnap = await getDocs(
        query(attendeesRef, where("studentId", "==", studentData?.uid)),
      );
      if (!existingSnap.empty) {
        setResult("already");
        setMessage("You have already marked attendance for this session.");
        setProcessing(false);
        return;
      }

      // ── 6. Mark attendance ────────────────────────────────────────────────
      await addDoc(attendeesRef, {
        studentId: studentData?.uid,
        studentName: `${studentData?.firstName} ${studentData?.lastName}`,
        matricNumber: studentData?.matricNumber,
        courseId,
        sessionId,
        timestamp: serverTimestamp(),
        method: "QR",
      });

      const existingAttSnap = await getDocs(
        query(
          collection(db, "attendance"),
          where("studentId", "==", studentData?.uid),
          where("sessionId", "==", sessionId),
          where("status", "==", "present"),
        ),
      );
      if (existingAttSnap.empty) {
        await addDoc(collection(db, "attendance"), {
          studentId: studentData?.uid,
          studentName: `${studentData?.firstName} ${studentData?.lastName}`,
          matricNumber: studentData?.matricNumber,
          courseId,
          sessionId,
          lecturerId: sessionData.lecturerId,
          timestamp: serverTimestamp(),
          method: "QR",
          status: "present",
        });
      }

      setResult("success");
      setMessage(
        `Attendance marked successfully for ${sessionData.courseTitle}!`,
      );
    } catch {
      setResult("error");
      setMessage("Invalid QR code. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setResult(null);
    setMessage("");
    setDistance(null);
  };

  // ── Web fallback ──────────────────────────────────────────────────────────
  if (isWeb) {
    return (
      <View style={styles.container}>
        {(isWeb || sidebarOpen) && (
          <Sidebar
            role="student"
            userName={
              studentData
                ? `${studentData.firstName} ${studentData.lastName}`
                : "..."
            }
            activeRoute="/screens/student/ScanQR"
          />
        )}
        <View style={styles.content}>
          <View style={styles.topBar}>
            <Text style={styles.headerTitle}>Scan QR Code</Text>
          </View>
          <View style={styles.center}>
            <Ionicons name="qr-code-outline" size={64} color="#D0D0D0" />
            <Text style={styles.webTitle}>Camera Not Available on Web</Text>
            <Text style={styles.webSubtitle}>
              Please use the mobile app to scan QR codes for attendance
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2C3E7A" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#2C3E7A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Scan QR Code</Text>
          </View>
          <View style={styles.center}>
            <Ionicons name="camera-outline" size={64} color="#D0D0D0" />
            <Text style={styles.webTitle}>Camera Permission Required</Text>
            <Text style={styles.webSubtitle}>
              We need camera access to scan QR codes
            </Text>
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={requestPermission}
            >
              <Text style={styles.permissionButtonText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Result / Camera ───────────────────────────────────────────────────────
  const resultConfig = {
    success: {
      icon: "checkmark-circle",
      color: "#27AE60",
      title: "Attendance Marked!",
      border: "#27AE60",
      btnLabel: "Done",
      onPress: () => router.back(),
    },
    already: {
      icon: "information-circle",
      color: "#F39C12",
      title: "Already Marked",
      border: "#F39C12",
      btnLabel: "Go Back",
      onPress: () => router.back(),
    },
    error: {
      icon: "close-circle",
      color: "#E74C3C",
      title: "Error",
      border: "#E74C3C",
      btnLabel: "Try Again",
      onPress: resetScanner,
    },
    geo: {
      icon: "location-outline",
      color: "#E74C3C",
      title: "Too Far Away",
      border: "#E74C3C",
      btnLabel: "Try Again",
      onPress: resetScanner,
    },
  } as const;

  return (
    <View style={styles.container}>
      {sidebarOpen && (
        <Sidebar
          role="student"
          userName={
            studentData
              ? `${studentData.firstName} ${studentData.lastName}`
              : "..."
          }
          activeRoute="/screens/student/ScanQR"
        />
      )}

      <View style={styles.content}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setSidebarOpen(!sidebarOpen)}
          >
            <Ionicons
              name={sidebarOpen ? "close" : "menu"}
              size={24}
              color="#2C3E7A"
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#2C3E7A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan QR Code</Text>
        </View>

        {result ? (
          <View style={styles.resultContainer}>
            <View
              style={[
                styles.resultCard,
                { borderTopColor: resultConfig[result].border },
              ]}
            >
              <Ionicons
                name={resultConfig[result].icon as any}
                size={64}
                color={resultConfig[result].color}
              />
              <Text style={styles.resultTitle}>
                {resultConfig[result].title}
              </Text>
              <Text style={styles.resultMessage}>{message}</Text>

              {/* Extra geo context */}
              {result === "geo" && distance !== null && (
                <View style={styles.geoBox}>
                  <Ionicons name="navigate-outline" size={16} color="#E74C3C" />
                  <Text style={styles.geoBoxText}>
                    Move closer to the classroom and try again.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.scanAgainButton}
                onPress={resultConfig[result].onPress}
              >
                <Text style={styles.scanAgainText}>
                  {resultConfig[result].btnLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              facing="back"
              selectedLens="wide-angle-camera"
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            >
              <View style={styles.overlay}>
                <View style={styles.scanArea}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
                <Text style={styles.scanText}>
                  {processing
                    ? "Checking location & processing…"
                    : "Point camera at QR code"}
                </Text>
                {processing && (
                  <ActivityIndicator
                    size="large"
                    color="#fff"
                    style={{ marginTop: 16 }}
                  />
                )}
              </View>
            </CameraView>
          </View>
        )}
      </View>

      {sidebarOpen && (
        <TouchableOpacity
          style={styles.sidebarOverlay}
          onPress={() => setSidebarOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row", backgroundColor: "#000" },
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
    paddingVertical: 16,
    paddingTop: isWeb ? 22 : 50,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    gap: 12,
    minHeight: isWeb ? 69 : 80,
    zIndex: 10,
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
    fontSize: isWeb ? 18 : 15,
    fontWeight: "bold",
    color: "#2C3E7A",
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 24,
    backgroundColor: "#F5F6FA",
  },
  webTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2C3E7A",
    textAlign: "center",
  },
  webSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  permissionButton: {
    backgroundColor: "#2C3E7A",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  permissionButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanArea: { width: 250, height: 250, position: "relative" },
  corner: { position: "absolute", width: 30, height: 30, borderColor: "#fff" },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  scanText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 24,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  resultContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F5F6FA",
  },
  resultCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    gap: 16,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderTopWidth: 4,
  },
  resultTitle: { fontSize: 22, fontWeight: "bold", color: "#2C3E7A" },
  resultMessage: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  geoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FDEDEC",
    borderRadius: 8,
    padding: 12,
    width: "100%",
  },
  geoBoxText: { fontSize: 13, color: "#E74C3C", flex: 1 },
  scanAgainButton: {
    backgroundColor: "#2C3E7A",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  scanAgainText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  sidebarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 10,
  },
});
