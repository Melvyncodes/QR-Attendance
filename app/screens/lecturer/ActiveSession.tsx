import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useResponsive } from '@/hooks/useResponsive';
import { router, useLocalSearchParams } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as XLSX from 'xlsx';
import { db } from '../../../firebase';

const isWeb = Dimensions.get('window').width > 768;
const NFC_SERVER = 'http://localhost:3333';

const RADIUS_OPTIONS = [30, 50, 100, 200];

export default function ActiveSession() {
  const { userData: lecturerData } = useUser();
  const params = useLocalSearchParams();
  const { courseId, courseTitle, courseCode, existingSessionId } = params;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(5 * 60);
  const [durationInput, setDurationInput] = useState('5');
  const [selectedDuration, setSelectedDuration] = useState(5 * 60);
  const [durationError, setDurationError] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [attendanceList, setAttendanceList] = useState<any[]>([]);
  const [ending, setEnding] = useState(false);
  const [enrolledUIDs, setEnrolledUIDs] = useState<string[]>([]);

  // ── Geo state ──────────────────────────────────────────────────────────────
  const [geoEnabled, setGeoEnabled] = useState(false);
  const [geoRadius, setGeoRadius] = useState(100);
  const [geoLat, setGeoLat] = useState<number | null>(null);
  const [geoLng, setGeoLng] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [geoLocationSet, setGeoLocationSet] = useState(false);

  // ── NFC state ──────────────────────────────────────────────────────────────
  const [nfcMode, setNfcMode] = useState(false);
  const [nfcReaderReady, setNfcReaderReady] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcLastScan, setNfcLastScan] = useState<{
    name: string; matric: string; status: 'success' | 'unknown' | 'duplicate';
  } | null>(null);
  const nfcModeRef = useRef(false);
  const nfcAbortRef = useRef<AbortController | null>(null);
  const nfcFlashAnim = useRef(new Animated.Value(0)).current;

  // ── Refs ───────────────────────────────────────────────────────────────────
  const timerRef = useRef<any>(null);
  const selectedDurationRef = useRef(5 * 60);
  const sessionActiveRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const endingRef = useRef(false);
  const attendanceListRef = useRef<any[]>([]);
  const enrolledUIDsRef = useRef<string[]>([]);
  const lecturerDataRef = useRef<any>(null);

  useEffect(() => { selectedDurationRef.current = selectedDuration; }, [selectedDuration]);
  useEffect(() => { sessionActiveRef.current = sessionActive; }, [sessionActive]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { attendanceListRef.current = attendanceList; }, [attendanceList]);
  useEffect(() => { enrolledUIDsRef.current = enrolledUIDs; }, [enrolledUIDs]);
  useEffect(() => { lecturerDataRef.current = lecturerData; }, [lecturerData]);
  useEffect(() => { nfcModeRef.current = nfcMode; }, [nfcMode]);

  // ── Enrolled students ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!courseId) return;
    return onSnapshot(doc(db, 'courses', courseId as string), snap => {
      if (snap.exists()) setEnrolledUIDs(snap.data()?.enrolledStudents || []);
    });
  }, [courseId]);

  // ── Restore existing session ───────────────────────────────────────────────
  useEffect(() => {
    if (!existingSessionId) return;
    const restore = async () => {
      setRestoring(true);
      try {
        const sessSnap = await getDoc(doc(db, 'sessions', existingSessionId as string));
        if (!sessSnap.exists()) return;
        const data = sessSnap.data();
        if (data.status !== 'active') return;
        const expiry = new Date(data.qrExpiry).getTime();
        const remaining = Math.max(0, Math.floor((expiry - Date.now()) / 1000));

        // If the session has already expired by time, don't restart it.
        // Just leave the page in its initial (non-active) state.
        if (remaining <= 0) {
          console.log('Session already expired by time, not restoring');
          return;
        }

        const duration = data.qrDuration || 5 * 60;
        setSessionId(existingSessionId as string);
        sessionIdRef.current = existingSessionId as string;
        setQrValue(data.qrCode);
        setSelectedDuration(duration);
        selectedDurationRef.current = duration;
        setTimeLeft(remaining);
        setSessionActive(true);
        sessionActiveRef.current = true;
        // Restore geo settings
        if (data.geoEnabled) {
          setGeoEnabled(true);
          setGeoLat(data.geoLat);
          setGeoLng(data.geoLng);
          setGeoRadius(data.geoRadius || 100);
          setGeoLocationSet(true);
        }
      } catch (err) { console.error(err); }
      finally { setRestoring(false); }
    };
    restore();
  }, [existingSessionId]);

  // ── Attendance listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    return onSnapshot(collection(db, 'sessions', sessionId, 'attendees'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttendanceList(list);
      attendanceListRef.current = list;
      if (sessionActiveRef.current) {
        updateDoc(doc(db, 'sessions', sessionId), { totalPresent: list.length }).catch(() => { });
      }
    });
  }, [sessionId]);

  // ── NFC reader check ───────────────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${NFC_SERVER}/status`, { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        setNfcReaderReady(data.connected === true);
      } catch { setNfcReaderReady(false); }
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!nfcMode) { nfcAbortRef.current?.abort(); nfcAbortRef.current = null; setNfcScanning(false); }
  }, [nfcMode]);

  useEffect(() => { if (!sessionActive && nfcMode) setNfcMode(false); }, [sessionActive]);

  const flashResult = useCallback(() => {
    nfcFlashAnim.setValue(1);
    Animated.timing(nfcFlashAnim, { toValue: 0, duration: 2500, useNativeDriver: true }).start();
  }, []);

  const markNfcAttendance = useCallback(async (uid: string) => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return;
    const snap = await getDocs(query(collection(db, 'users'), where('nfcUid', '==', uid)));
    if (snap.empty) {
      setNfcLastScan({ name: 'Unknown Card', matric: uid, status: 'unknown' });
      flashResult();
      return;
    }
    const studentDoc = snap.docs[0];
    const student = studentDoc.data();
    const studentId = studentDoc.id;
    const alreadyPresent = attendanceListRef.current.some(a => a.studentId === studentId);
    if (alreadyPresent) {
      setNfcLastScan({ name: `${student.firstName} ${student.lastName}`, matric: student.matricNumber, status: 'duplicate' });
      flashResult();
      return;
    }
    await addDoc(collection(db, 'sessions', currentSessionId, 'attendees'), {
      studentId, studentName: `${student.firstName} ${student.lastName}`,
      matricNumber: student.matricNumber, timestamp: serverTimestamp(), method: 'NFC',
    });
    await addDoc(collection(db, 'attendance'), {
      studentId, studentName: `${student.firstName} ${student.lastName}`,
      matricNumber: student.matricNumber, gender: student.gender || 'N/A',
      courseId, sessionId: currentSessionId, lecturerId: lecturerDataRef.current?.uid,
      timestamp: serverTimestamp(), method: 'NFC', status: 'present',
    });
    setNfcLastScan({ name: `${student.firstName} ${student.lastName}`, matric: student.matricNumber, status: 'success' });
    flashResult();
  }, [courseId, flashResult]);

  const runNfcLoop = useCallback(async () => {
    while (nfcModeRef.current && sessionActiveRef.current) {
      setNfcScanning(true);
      const ctrl = new AbortController();
      nfcAbortRef.current = ctrl;
      try {
        const res = await fetch(`${NFC_SERVER}/nfc/read`, { signal: ctrl.signal });
        if (!res.ok) { await new Promise(r => setTimeout(r, 1000)); continue; }
        const data = await res.json();
        if (data.uid) { setNfcScanning(false); await markNfcAttendance(data.uid); await new Promise(r => setTimeout(r, 1200)); }
      } catch (err: any) {
        if (err.name === 'AbortError') break;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    setNfcScanning(false);
  }, [markNfcAttendance]);

  const toggleNfcMode = () => {
    if (nfcMode) { setNfcMode(false); }
    else { setNfcMode(true); setTimeout(() => runNfcLoop(), 100); }
  };

  // ── Geo: capture lecturer location ────────────────────────────────────────
  const handleGetLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (Platform.OS === 'web') window.alert('Location permission denied.');
        else Alert.alert('Permission Denied', 'Location permission is required to set classroom location.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setGeoLat(pos.coords.latitude);
      setGeoLng(pos.coords.longitude);
      setGeoLocationSet(true);
    } catch {
      if (Platform.OS === 'web') window.alert('Could not get location. Make sure GPS is on.');
      else Alert.alert('Error', 'Could not get your location. Make sure GPS is on.');
    } finally {
      setGettingLocation(false);
    }
  };

  // ── Persistent cumulative Excel ────────────────────────────────────────────
  /**
   * Builds or updates the course's persistent attendance sheet.
   * Structure: S/N | Name | Matric | [date1] | [date2] | ...
   * Each session adds one new date column with P/A per enrolled student.
   * Stored as base64 on the course document: courses/{courseId}.attendanceSheetBase64
   */
  const buildOrUpdateCumulativeExcel = async (
    sessionDate: string,
    presentUIDs: string[],
    enrolledStudents: any[],
    lecturer: any
  ): Promise<string> => {
    const courseRef = doc(db, 'courses', courseId as string);
    const courseSnap = await getDoc(courseRef);
    const existingBase64: string | null = courseSnap.data()?.attendanceSheetBase64 || null;

    // Sort enrolled students alphabetically
    const sorted = [...enrolledStudents].sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );

    const lecturerFullName = `${lecturer?.title || ''} ${lecturer?.firstName} ${lecturer?.lastName}`.trim();
    const dateLabel = new Date(sessionDate).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
    const timeLabel = new Date(sessionDate).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit',
    });
    const colHeader = `${dateLabel}\n${timeLabel}`;

    let wb: XLSX.WorkBook;
    let ws: XLSX.WorkSheet;
    let existingRows: any[][];
    let headerRowIdx = 5; // 0-indexed: row 6 is column headers (S/N, Name, Matric, ...)
    let dataStartIdx = 6; // student data starts at row 7

    if (existingBase64) {
      // ── Load existing workbook and append a new date column ──────────────
      const buf = Uint8Array.from(atob(existingBase64), c => c.charCodeAt(0));
      wb = XLSX.read(buf, { type: 'array' });
      ws = wb.Sheets[wb.SheetNames[0]];
      existingRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      // Find how many date columns already exist (columns after Matric = col index 3+)
      const headerRow: any[] = existingRows[headerRowIdx] || [];
      const newColIdx = headerRow.length; // next available column

      // Add new header in row 5 (col headers)
      XLSX.utils.sheet_add_aoa(ws, [[colHeader]], { origin: { r: headerRowIdx, c: newColIdx } });

      // Fill P/A for each enrolled student row
      for (let i = 0; i < sorted.length; i++) {
        const rowIdx = dataStartIdx + i;
        const isPresent = presentUIDs.includes(sorted[i].uid);
        XLSX.utils.sheet_add_aoa(ws, [[isPresent ? 'P' : 'A']], { origin: { r: rowIdx, c: newColIdx } });
      }

      // Update summary totals row (last row)
      const presentCount = sorted.filter(s => presentUIDs.includes(s.uid)).length;
      const absentCount = sorted.length - presentCount;
      const rate = sorted.length > 0 ? Math.round((presentCount / sorted.length) * 100) : 0;
      const summaryRow = existingRows.length - 1;
      XLSX.utils.sheet_add_aoa(ws, [
        [`SESSIONS: ${newColIdx - 2}  |  LAST: ${dateLabel}  |  PRESENT: ${presentCount}  |  ABSENT: ${absentCount}  |  RATE: ${rate}%`],
      ], { origin: { r: summaryRow, c: 0 } });

    } else {
      // ── Create brand new workbook ─────────────────────────────────────────
      wb = XLSX.utils.book_new();

      const totalCols = 3 + 1; // S/N, Name, Matric + first date col
      const blankCols = Array(totalCols - 1).fill('');

      const rows: any[][] = [];
      // Row 0: Title
      rows.push([`ATTENDANCE SHEET — ${new Date().getFullYear()} ACADEMIC SESSION`, ...blankCols]);
      // Row 1: Course code | Programme
      rows.push([`COURSE CODE: ${courseCode}`, '', '', `PROGRAMME: ${lecturer?.department || ''}`]);
      // Row 2: Course title | Enrolled
      rows.push([`COURSE TITLE: ${courseTitle}`, '', '', `${sorted.length} STUDENTS ENROLLED`]);
      // Row 3: Lecturer
      rows.push([`LECTURER: ${lecturerFullName}`, ...blankCols]);
      // Row 4: Section label
      rows.push(['STUDENTS DETAILS', '', '', 'ATTENDANCE']);
      // Row 5 (headerRowIdx): Column headers
      rows.push(['S/N', 'NAME', 'MATRIC NO.', colHeader]);
      // Rows 6+ (dataStartIdx): Student data
      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        const isPresent = presentUIDs.includes(s.uid);
        rows.push([i + 1, `${s.firstName} ${s.lastName}`.toUpperCase(), s.matricNumber.toUpperCase(), isPresent ? 'P' : 'A']);
      }
      // Summary row
      const presentCount = sorted.filter(s => presentUIDs.includes(s.uid)).length;
      const absentCount = sorted.length - presentCount;
      const rate = sorted.length > 0 ? Math.round((presentCount / sorted.length) * 100) : 0;
      rows.push([`SESSIONS: 1  |  LAST: ${dateLabel}  |  PRESENT: ${presentCount}  |  ABSENT: ${absentCount}  |  RATE: ${rate}%`]);

      ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 15 }, { wch: 16 }];
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: totalCols - 1 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: 2 } },
        { s: { r: rows.length - 1, c: 0 }, e: { r: rows.length - 1, c: totalCols - 1 } },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance Sheet');
    }

    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

    // Persist to Firestore on the course document
    await updateDoc(courseRef, { attendanceSheetBase64: base64 });

    return base64;
  };

  // ── End session ────────────────────────────────────────────────────────────
  const endSessionCore = async (autoEnded: boolean) => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId || endingRef.current) return;
    endingRef.current = true;
    clearInterval(timerRef.current);
    timerRef.current = null;
    sessionActiveRef.current = false;
    setNfcMode(false);
    setEnding(true);
    setSessionActive(false);

    try {
      const currentAttendanceList = [...attendanceListRef.current];
      const currentEnrolledUIDs = [...enrolledUIDsRef.current];
      const currentLecturer = lecturerDataRef.current;

      // Get fresh enrolled list from course
      const courseSnap = await getDoc(doc(db, 'courses', courseId as string));
      const freshEnrolledUIDs: string[] = courseSnap.data()?.enrolledStudents || currentEnrolledUIDs;

      // Get student profiles for enrolled students only
      const studentProfiles = await Promise.all(
        freshEnrolledUIDs.map(async uid => {
          const userSnap = await getDoc(doc(db, 'users', uid));
          return userSnap.exists() ? { uid, ...userSnap.data() } : null;
        })
      );
      const validStudents = studentProfiles.filter(Boolean) as any[];
      const presentUIDs = currentAttendanceList.map((a: any) => a.studentId);
      const presentStudents = validStudents.filter(s => presentUIDs.includes(s.uid));
      const absentStudents = validStudents.filter(s => !presentUIDs.includes(s.uid));

      // Mark absents in attendance collection
      await Promise.all(
        absentStudents.map(student =>
          addDoc(collection(db, 'attendance'), {
            studentId: student.uid,
            studentName: `${student.firstName} ${student.lastName}`,
            matricNumber: student.matricNumber,
            gender: student.gender || 'N/A',
            courseId, sessionId: currentSessionId,
            lecturerId: currentLecturer?.uid,
            timestamp: serverTimestamp(), method: 'AUTO', status: 'absent',
          })
        )
      );

      // Update session status
      await updateDoc(doc(db, 'sessions', currentSessionId), {
        status: 'closed', endTime: serverTimestamp(),
        totalPresent: presentStudents.length, totalAbsent: absentStudents.length,
      });

      const sessionDate = new Date().toISOString();

      // Build/update the persistent cumulative Excel sheet
      const excelBase64 = await buildOrUpdateCumulativeExcel(
        sessionDate, presentUIDs, validStudents, currentLecturer
      );

      // Save individual session report (references same Excel)
      const reportRef = await addDoc(collection(db, 'reports'), {
        courseId, courseTitle, courseCode,
        sessionId: currentSessionId,
        lecturerId: currentLecturer?.uid,
        lecturerName: `${currentLecturer?.title || ''} ${currentLecturer?.firstName} ${currentLecturer?.lastName}`.trim(),
        totalEnrolled: freshEnrolledUIDs.length,
        totalPresent: presentStudents.length,
        totalAbsent: absentStudents.length,
        attendanceRate: freshEnrolledUIDs.length > 0
          ? Math.round((presentStudents.length / freshEnrolledUIDs.length) * 100) : 0,
        presentStudents: presentStudents.map(s => ({
          uid: s.uid, name: `${s.firstName} ${s.lastName}`,
          matricNumber: s.matricNumber, gender: s.gender || 'N/A', department: s.department,
        })),
        absentStudents: absentStudents.map(s => ({
          uid: s.uid, name: `${s.firstName} ${s.lastName}`,
          matricNumber: s.matricNumber, gender: s.gender || 'N/A', department: s.department,
        })),
        // Per-session Excel still saved for individual download
        excelBase64,
        autoEnded, createdAt: serverTimestamp(), date: sessionDate,
      });

      // Notifications
      await addDoc(collection(db, 'notifications'), {
        userId: currentLecturer?.uid, type: 'session_ended',
        message: `${autoEnded ? 'Timer expired.' : 'Session ended.'} ${courseCode}: ${presentStudents.length} present, ${absentStudents.length} absent. Cumulative report updated.`,
        courseId, sessionId: currentSessionId, reportId: reportRef.id,
        read: false, createdAt: serverTimestamp(),
      });

      await Promise.all(
        freshEnrolledUIDs.map(studentId => {
          const wasPresent = presentUIDs.includes(studentId);
          return addDoc(collection(db, 'notifications'), {
            userId: studentId, type: 'session_ended',
            message: wasPresent
              ? `Attendance confirmed for ${courseCode} — ${courseTitle}. You were marked present.`
              : `You were marked absent for ${courseCode} — ${courseTitle}. Contact your lecturer if this is an error.`,
            courseId, courseCode, courseTitle, sessionId: currentSessionId,
            read: false, createdAt: serverTimestamp(),
          });
        })
      ).catch(err => console.error('Error notifying students:', err));

      if (autoEnded) {
        // Timer expired — clear local active state so UI doesn't auto-restart on refresh/refocus
        setSessionActive(false);
        sessionActiveRef.current = false;
        clearInterval(timerRef.current);

        // Stay on page, just show a friendly toast/alert without redirecting
        if (Platform.OS === 'web') {
          window.alert(
            `Timer expired — session ended automatically.\n` +
            `${presentStudents.length} present, ${absentStudents.length} absent.\n` +
            `Tap the back arrow when you're ready to leave.`
          );
        } else {
          Alert.alert(
            'Session Auto-Ended',
            `${presentStudents.length} present, ${absentStudents.length} absent.\nReport saved. Tap the back arrow when you're ready.`,
            [{ text: 'OK' }]
          );
        }
      } else {
        // Manual end — go back as before
        if (Platform.OS === 'web') {
          window.alert(
            `Session ended!\n` +
            `${presentStudents.length} present, ${absentStudents.length} absent.\n` +
            `Cumulative attendance sheet updated.`
          );
          router.back();
        } else {
          Alert.alert(
            'Session Ended',
            `${presentStudents.length} present, ${absentStudents.length} absent.\nCumulative sheet updated in Reports.`,
            [{ text: 'OK', onPress: () => router.back() }]
          );
        }
      }
    } catch (err) {
      console.error('Error ending session:', err);
      endingRef.current = false;
      setEnding(false);
    }
  };

  // ── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionActive || !sessionId) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setTimeout(() => {
            if (sessionActiveRef.current && !endingRef.current) endSessionCore(true);
          }, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [sessionActive, sessionId]);

  const handleDurationChange = (text: string) => {
    setDurationInput(text);
    setDurationError('');
    const mins = parseInt(text);
    if (!text || isNaN(mins)) { setDurationError('Please enter a valid number'); return; }
    if (mins < 1) { setDurationError('Minimum duration is 1 minute'); return; }
    if (mins > 120) { setDurationError('Maximum duration is 120 minutes'); return; }
    setSelectedDuration(mins * 60);
  };

  const generateQRValue = (sessId: string) => {
    const timestamp = Date.now();
    return JSON.stringify({
      sessionId: sessId, courseId, timestamp,
      expires: timestamp + selectedDurationRef.current * 1000,
    });
  };

  const startSession = async () => {
    const count = enrolledUIDsRef.current.length;
    if (count === 0) {
      Platform.OS === 'web'
        ? window.alert('No students enrolled.')
        : Alert.alert('No Students Enrolled', 'Students must enroll before you can take attendance.');
      return;
    }
    const mins = parseInt(durationInput);
    if (!durationInput || isNaN(mins) || mins < 1 || mins > 120) {
      setDurationError('Please enter a valid duration between 1 and 120 minutes');
      return;
    }
    if (geoEnabled && !geoLocationSet) {
      Platform.OS === 'web'
        ? window.alert('Please set your classroom location before starting.')
        : Alert.alert('Location Required', 'Please tap "Use My Location" to set the classroom location.');
      return;
    }
    setLoading(true);
    try {
      const sessionRef = await addDoc(collection(db, 'sessions'), {
        courseId, courseTitle, courseCode,
        lecturerId: lecturerData?.uid,
        lecturerName: `${lecturerData?.title || ''} ${lecturerData?.firstName} ${lecturerData?.lastName}`.trim(),
        startTime: serverTimestamp(),
        status: 'active',
        totalEnrolled: count,
        totalPresent: 0,
        qrDuration: selectedDuration,
        createdAt: new Date().toISOString(),
        // Geo fields
        geoEnabled,
        geoLat: geoEnabled ? geoLat : null,
        geoLng: geoEnabled ? geoLng : null,
        geoRadius: geoEnabled ? geoRadius : null,
      });
      const sessId = sessionRef.id;
      setSessionId(sessId);
      sessionIdRef.current = sessId;
      const qr = generateQRValue(sessId);
      setQrValue(qr);
      await updateDoc(doc(db, 'sessions', sessId), {
        qrCode: qr,
        qrExpiry: new Date(Date.now() + selectedDuration * 1000).toISOString(),
      });
      setSessionActive(true);
      sessionActiveRef.current = true;
      setTimeLeft(selectedDuration);

      await Promise.all(
        [...enrolledUIDsRef.current].map(studentId =>
          addDoc(collection(db, 'notifications'), {
            userId: studentId, type: 'session_started',
            message: `Attendance session is live for ${courseCode} — ${courseTitle}. Open the app and scan the QR code to mark your attendance.`,
            courseId, courseCode, courseTitle,
            sessionId: sessId, read: false, createdAt: serverTimestamp(),
          })
        )
      ).catch(err => console.error('Error notifying students:', err));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const endSession = () => {
    const confirm = () => endSessionCore(false);
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to end this attendance session?')) confirm();
    } else {
      Alert.alert('End Session', 'Are you sure you want to end this session?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End Session', style: 'destructive', onPress: confirm },
      ]);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const timerColor = timeLeft > 60 ? '#27AE60' : timeLeft > 30 ? '#F39C12' : '#E74C3C';
  const nfcResultColor =
    nfcLastScan?.status === 'success' ? '#27ae60'
      : nfcLastScan?.status === 'duplicate' ? '#E67E22'
        : '#E74C3C';

  if (restoring) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2C3E7A" />
        <Text style={styles.loadingText}>Loading session...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {(isWeb || sidebarOpen) && (
        <Sidebar
          role="lecturer"
          userName={lecturerData ? `${lecturerData.title || ''} ${lecturerData.firstName} ${lecturerData.lastName}`.trim() : '...'}
          activeRoute="/screens/lecturer/Attendance"
        />
      )}

      <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.topBar}>
          {!isWeb && (
            <TouchableOpacity style={styles.menuButton} onPress={() => setSidebarOpen(!sidebarOpen)}>
              <Ionicons name={sidebarOpen ? 'close' : 'menu'} size={24} color="#2C3E7A" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#2C3E7A" />
          </TouchableOpacity>
          <View style={styles.topBarInfo}>
            <Text style={styles.headerTitle}>{courseCode as string}</Text>
            <Text style={styles.headerSubtitle}>{courseTitle as string}</Text>
          </View>
          {sessionActive && (
            <TouchableOpacity style={styles.endButton} onPress={endSession} disabled={ending}>
              {ending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.endButtonText}>End Session</Text>}
            </TouchableOpacity>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.mainContent}>

            {/* QR / Start section */}
            <View style={styles.qrSection}>
              {!sessionActive ? (
                <View style={styles.startSection}>
                  <Ionicons name="qr-code-outline" size={64} color="#2C3E7A" />
                  <Text style={styles.startTitle}>Ready to Take Attendance</Text>
                  <Text style={styles.startSubtitle}>
                    {courseTitle}{'\n'}{enrolledUIDs.length} students enrolled
                  </Text>

                  {/* Duration */}
                  <View style={styles.durationContainer}>
                    <Text style={styles.durationLabel}>QR Code Duration (minutes)</Text>
                    <View style={styles.durationInputRow}>
                      <TouchableOpacity style={styles.durationBtn}
                        onPress={() => { const c = parseInt(durationInput) || 5; if (c > 1) handleDurationChange(String(c - 1)); }}>
                        <Ionicons name="remove" size={20} color="#2C3E7A" />
                      </TouchableOpacity>
                      <TextInput
                        style={styles.durationInput} value={durationInput}
                        onChangeText={handleDurationChange} keyboardType="number-pad"
                        placeholder="5" placeholderTextColor="#999" maxLength={3} textAlign="center"
                      />
                      <TouchableOpacity style={styles.durationBtn}
                        onPress={() => { const c = parseInt(durationInput) || 5; if (c < 120) handleDurationChange(String(c + 1)); }}>
                        <Ionicons name="add" size={20} color="#2C3E7A" />
                      </TouchableOpacity>
                    </View>
                    {durationError
                      ? <Text style={styles.durationError}>{durationError}</Text>
                      : <Text style={styles.durationHint}>Min: 1 min • Max: 120 mins • Auto-ends when timer expires</Text>
                    }
                  </View>

                  {/* ── Geolocation setup ─────────────────────────────────── */}
                  <View style={styles.geoSetupCard}>
                    <View style={styles.geoSetupHeader}>
                      <View style={styles.geoSetupLeft}>
                        <Ionicons name="location-outline" size={18} color="#2C3E7A" />
                        <View>
                          <Text style={styles.geoSetupTitle}>Geolocation Verification</Text>
                          <Text style={styles.geoSetupSub}>Require students to be in the classroom</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.geoToggle, geoEnabled && styles.geoToggleOn]}
                        onPress={() => { setGeoEnabled(v => !v); setGeoLocationSet(false); setGeoLat(null); setGeoLng(null); }}
                      >
                        <Text style={[styles.geoToggleText, geoEnabled && styles.geoToggleTextOn]}>
                          {geoEnabled ? 'ON' : 'OFF'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {geoEnabled && (
                      <View style={styles.geoSetupBody}>
                        {/* Radius picker */}
                        <Text style={styles.geoLabel}>Allowed radius</Text>
                        <View style={styles.radiusPills}>
                          {RADIUS_OPTIONS.map(r => (
                            <TouchableOpacity
                              key={r}
                              style={[styles.radiusPill, geoRadius === r && styles.radiusPillActive]}
                              onPress={() => setGeoRadius(r)}
                            >
                              <Text style={[styles.radiusPillText, geoRadius === r && styles.radiusPillTextActive]}>
                                {r}m
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {/* Set location button */}
                        <TouchableOpacity
                          style={[styles.getLocationBtn, geoLocationSet && styles.getLocationBtnSet]}
                          onPress={handleGetLocation}
                          disabled={gettingLocation}
                        >
                          {gettingLocation ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <Ionicons
                                name={geoLocationSet ? 'checkmark-circle-outline' : 'locate-outline'}
                                size={16} color="#fff"
                              />
                              <Text style={styles.getLocationBtnText}>
                                {geoLocationSet
                                  ? `Location set (±${geoRadius}m) — tap to update`
                                  : 'Use My Location as Classroom'}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>

                        {geoLocationSet && geoLat && geoLng && (
                          <Text style={styles.geoCoords}>
                            {geoLat.toFixed(5)}, {geoLng.toFixed(5)}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  <TouchableOpacity style={styles.startButton} onPress={startSession} disabled={loading}>
                    {loading
                      ? <ActivityIndicator color="#fff" />
                      : <><Ionicons name="play-circle-outline" size={20} color="#fff" /><Text style={styles.startButtonText}>Start Attendance Session</Text></>
                    }
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.activeSection}>
                  {geoEnabled && (
                    <View style={styles.geoActiveBadge}>
                      <Ionicons name="location" size={13} color="#27ae60" />
                      <Text style={styles.geoActiveBadgeText}>Geolocation ON · {geoRadius}m radius</Text>
                    </View>
                  )}
                  <View style={styles.timerContainer}>
                    <Text style={styles.timerLabel}>Session ends in</Text>
                    <Text style={[styles.timer, { color: timerColor }]}>{formatTime(timeLeft)}</Text>
                    <Text style={styles.timerNote}>Session auto-ends and cumulative report is updated when timer expires</Text>
                  </View>
                  {qrValue && (
                    <View style={styles.qrContainer}>
                      <QRCode value={qrValue} size={isWeb ? 250 : 200} backgroundColor="white" color="#2C3E7A" />
                    </View>
                  )}
                  <Text style={styles.qrInstruction}>Students should scan this QR code to mark attendance</Text>
                </View>
              )}
            </View>

            {/* NFC panel */}
            {sessionActive && (
              <View style={styles.nfcPanel}>
                <View style={styles.nfcPanelHeader}>
                  <View style={styles.nfcPanelLeft}>
                    <Ionicons name="wifi-outline" size={20} color="#2C3E7A" />
                    <View>
                      <Text style={styles.nfcPanelTitle}>NFC Tap Attendance</Text>
                      <Text style={styles.nfcPanelSub}>
                        {nfcReaderReady
                          ? 'ACR122U connected — tap cards to mark attendance'
                          : 'ACR122U not detected — start nfc-server/server.js'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.nfcToggle, nfcMode && styles.nfcToggleOn, !nfcReaderReady && styles.nfcToggleDisabled]}
                    onPress={nfcReaderReady ? toggleNfcMode : undefined}
                    disabled={!nfcReaderReady}
                  >
                    <Text style={[styles.nfcToggleText, nfcMode && styles.nfcToggleTextOn]}>
                      {nfcMode ? 'ON' : 'OFF'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {nfcMode && (
                  <View style={styles.nfcActiveArea}>
                    <View style={styles.nfcWaiting}>
                      {nfcScanning
                        ? <ActivityIndicator size="small" color="#2C3E7A" />
                        : <View style={styles.nfcReadyDot} />
                      }
                      <Text style={styles.nfcWaitingText}>
                        {nfcScanning ? 'Reading card…' : 'Ready — tap a student card on the reader'}
                      </Text>
                    </View>
                    {nfcLastScan && (
                      <Animated.View style={[styles.nfcResult, { opacity: nfcFlashAnim, borderColor: nfcResultColor }]}>
                        <Ionicons
                          name={nfcLastScan.status === 'success' ? 'checkmark-circle' : nfcLastScan.status === 'duplicate' ? 'time-outline' : 'close-circle'}
                          size={22} color={nfcResultColor}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.nfcResultName, { color: nfcResultColor }]}>
                            {nfcLastScan.status === 'success' ? '✓ ' : nfcLastScan.status === 'duplicate' ? '⟳ ' : '✗ '}
                            {nfcLastScan.name}
                          </Text>
                          <Text style={styles.nfcResultMatric}>{nfcLastScan.matric}</Text>
                          <Text style={[styles.nfcResultStatus, { color: nfcResultColor }]}>
                            {nfcLastScan.status === 'success' ? 'Marked present' : nfcLastScan.status === 'duplicate' ? 'Already marked' : 'Card not registered'}
                          </Text>
                        </View>
                      </Animated.View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Live attendance list */}
            {sessionActive && (
              <View style={styles.attendanceSection}>
                <View style={styles.attendanceHeader}>
                  <Text style={styles.attendanceTitle}>
                    Live Attendance ({attendanceList.length}/{enrolledUIDs.length})
                  </Text>
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                </View>
                {attendanceList.length === 0 ? (
                  <View style={styles.emptyAttendance}>
                    <Text style={styles.emptyAttendanceText}>Waiting for students to scan...</Text>
                  </View>
                ) : (
                  attendanceList.map((attendee, index) => (
                    <View key={attendee.id} style={styles.attendeeRow}>
                      <View style={styles.attendeeNumber}>
                        <Text style={styles.attendeeNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.attendeeInfo}>
                        <Text style={styles.attendeeName}>{attendee.studentName?.toUpperCase()}</Text>
                        <Text style={styles.attendeeMatric}>{attendee.matricNumber}</Text>
                      </View>
                      <View style={styles.attendeeMethodBadge}>
                        <Text style={styles.attendeeMethodText}>{attendee.method || 'QR'}</Text>
                      </View>
                      <Ionicons name="checkmark-circle" size={20} color="#27AE60" />
                    </View>
                  ))
                )}
              </View>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {sidebarOpen && !isWeb && (
        <TouchableOpacity style={styles.overlay} onPress={() => setSidebarOpen(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#F5F6FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F6FA', gap: 12 },
  loadingText: { fontSize: 14, color: '#666' },
  content: { flex: 1, overflow: 'hidden', minWidth: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 16, paddingTop: isWeb ? 13 : 50, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 12, minHeight: isWeb ? 64 : 80 },
  menuButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center' },
  topBarInfo: { flex: 1 },
  headerTitle: { fontSize: isWeb ? 18 : 15, fontWeight: 'bold', color: '#2C3E7A' },
  headerSubtitle: { fontSize: 12, color: '#666' },
  endButton: { backgroundColor: '#E74C3C', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  endButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  mainContent: { padding: 16, gap: 16 },

  qrSection: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
  startSection: { alignItems: 'center', gap: 16, paddingVertical: 20, width: '100%' },
  startTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E7A' },
  startSubtitle: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },

  durationContainer: { width: '100%', gap: 8, alignItems: 'center' },
  durationLabel: { fontSize: 14, fontWeight: '600', color: '#2C3E7A' },
  durationInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  durationBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#2C3E7A' },
  durationInput: { width: 80, height: 52, borderRadius: 10, borderWidth: 2, borderColor: '#2C3E7A', fontSize: 24, fontWeight: 'bold', color: '#2C3E7A', backgroundColor: '#F5F6FA', textAlign: 'center' },
  durationError: { fontSize: 12, color: '#E74C3C', textAlign: 'center' },
  durationHint: { fontSize: 11, color: '#999', textAlign: 'center' },

  // Geo setup card
  geoSetupCard: { width: '100%', backgroundColor: '#F5F6FA', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E0E0E0', gap: 12 },
  geoSetupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  geoSetupLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  geoSetupTitle: { fontSize: 14, fontWeight: '700', color: '#2C3E7A' },
  geoSetupSub: { fontSize: 11, color: '#888', marginTop: 1 },
  geoToggle: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#E0E0E0', marginLeft: 10 },
  geoToggleOn: { backgroundColor: '#2C3E7A' },
  geoToggleText: { fontSize: 12, fontWeight: '700', color: '#999' },
  geoToggleTextOn: { color: '#fff' },
  geoSetupBody: { gap: 10 },
  geoLabel: { fontSize: 12, fontWeight: '600', color: '#555' },
  radiusPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  radiusPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E0E0' },
  radiusPillActive: { backgroundColor: '#2C3E7A', borderColor: '#2C3E7A' },
  radiusPillText: { fontSize: 13, fontWeight: '600', color: '#666' },
  radiusPillTextActive: { color: '#fff' },
  getLocationBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2C3E7A', paddingVertical: 12, borderRadius: 10 },
  getLocationBtnSet: { backgroundColor: '#27ae60' },
  getLocationBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  geoCoords: { fontSize: 10, color: '#aaa', textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  geoActiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EAFAF1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  geoActiveBadgeText: { fontSize: 12, color: '#27ae60', fontWeight: '700' },

  startButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2C3E7A', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, gap: 8, marginTop: 8 },
  startButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  activeSection: { alignItems: 'center', gap: 20, width: '100%' },
  timerContainer: { alignItems: 'center', gap: 4 },
  timerLabel: { fontSize: 13, color: '#666' },
  timer: { fontSize: 48, fontWeight: 'bold' },
  timerNote: { fontSize: 11, color: '#999', textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
  qrContainer: { padding: 16, backgroundColor: '#fff', borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  qrInstruction: { fontSize: 13, color: '#666', textAlign: 'center' },

  nfcPanel: { backgroundColor: '#fff', borderRadius: 16, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4, gap: 14 },
  nfcPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nfcPanelLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  nfcPanelTitle: { fontSize: 14, fontWeight: '700', color: '#2C3E7A' },
  nfcPanelSub: { fontSize: 11, color: '#888', marginTop: 2, flexShrink: 1 },
  nfcToggle: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: '#ddd', marginLeft: 10 },
  nfcToggleOn: { backgroundColor: '#2C3E7A', borderColor: '#2C3E7A' },
  nfcToggleDisabled: { opacity: 0.4 },
  nfcToggleText: { fontSize: 12, fontWeight: '700', color: '#999' },
  nfcToggleTextOn: { color: '#fff' },
  nfcActiveArea: { gap: 10 },
  nfcWaiting: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EEF2FF', borderRadius: 10, padding: 12 },
  nfcReadyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#27ae60' },
  nfcWaitingText: { fontSize: 13, color: '#2C3E7A', fontWeight: '600', flex: 1 },
  nfcResult: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 10, padding: 12, borderWidth: 1.5, backgroundColor: '#FAFAFA' },
  nfcResultName: { fontSize: 14, fontWeight: '700' },
  nfcResultMatric: { fontSize: 12, color: '#666', marginTop: 1 },
  nfcResultStatus: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  attendanceSection: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
  attendanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  attendanceTitle: { fontSize: 16, fontWeight: 'bold', color: '#2C3E7A' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAFAF1', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#27AE60' },
  liveText: { fontSize: 11, fontWeight: '700', color: '#27AE60' },
  emptyAttendance: { paddingVertical: 30, alignItems: 'center' },
  emptyAttendanceText: { fontSize: 14, color: '#999' },
  attendeeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F6FA', gap: 12 },
  attendeeNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  attendeeNumberText: { fontSize: 12, fontWeight: '700', color: '#2C3E7A' },
  attendeeInfo: { flex: 1 },
  attendeeName: { fontSize: 14, fontWeight: '600', color: '#2D3436' },
  attendeeMatric: { fontSize: 12, color: '#666', marginTop: 2 },
  attendeeMethodBadge: { backgroundColor: '#F5F6FA', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  attendeeMethodText: { fontSize: 10, fontWeight: '700', color: '#888' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
});
