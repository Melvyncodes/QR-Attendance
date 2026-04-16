import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../../../firebase';

const screenWidth = Dimensions.get('window').width;
const isWeb = screenWidth > 768;

const GOOD = '#2C3E7A';
const BAD = '#E74C3C';

export default function MyCourses() {
  const { isWeb } = useResponsive();
  const { userData: studentData, userLoading } = useUser();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(isWeb);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSessions, setActiveSessions] = useState<Record<string, string>>({});
  const [unenrolling, setUnenrolling] = useState<string | null>(null);
  const [cancellingUnenroll, setCancellingUnenroll] = useState<string | null>(null);

  // Track pending unenroll requests: courseId -> notificationId
  const [pendingUnenrollRequests, setPendingUnenrollRequests] = useState<Record<string, string>>({});

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  // Real-time enrolled courses
  useEffect(() => {
    if (!studentData?.uid) return;
    const coursesRef = collection(db, 'courses');
    const q = query(coursesRef, where('enrolledStudents', 'array-contains', studentData.uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const courseList = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setCourses(courseList);
      setLoading(false);
    });
    return unsubscribe;
  }, [studentData]);

  // Real-time listener for pending unenroll requests from this student
  useEffect(() => {
    if (!studentData?.uid) return;
    const notifRef = collection(db, 'notifications');
    const q = query(
      notifRef,
      where('studentId', '==', studentData.uid),
      where('type', '==', 'unenroll_request'),
      where('status', '==', 'pending')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const requestMap: Record<string, string> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        // Only store one notif id per course (admin one)
        if (data.courseId && data.userId === 'admin') {
          requestMap[data.courseId] = d.id;
        }
      });
      setPendingUnenrollRequests(requestMap);
    });
    return unsubscribe;
  }, [studentData]);

  // Check for active sessions per course
  useEffect(() => {
    if (courses.length === 0) return;
    const checkActiveSessions = async () => {
      const activeMap: Record<string, string> = {};
      await Promise.all(
        courses.map(async (course) => {
          const q = query(
            collection(db, 'sessions'),
            where('courseId', '==', course.id),
            where('status', '==', 'active')
          );
          const snap = await getDocs(q);
          if (!snap.empty) activeMap[course.id] = snap.docs[0].id;
        })
      );
      setActiveSessions(activeMap);
    };
    checkActiveSessions();
  }, [courses]);

  const handleUnenrollRequest = (courseId: string, courseTitle: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm(`Request to unenroll from ${courseTitle}?\n\nThis requires lecturer/admin approval.`)) return;
      submitUnenrollRequest(courseId, courseTitle);
    } else {
      Alert.alert(
        'Unenroll Request',
        `Request to unenroll from ${courseTitle}?\n\nThis requires lecturer/admin approval.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Request', style: 'destructive', onPress: () => submitUnenrollRequest(courseId, courseTitle) }
        ]
      );
    }
  };

  const submitUnenrollRequest = async (courseId: string, courseTitle: string) => {
    if (!studentData?.uid) return;
    setUnenrolling(courseId);
    try {
      const course = courses.find(c => c.id === courseId);
      const lecturerId = course?.lecturerId;

      if (lecturerId) {
        await addDoc(collection(db, 'notifications'), {
          userId: lecturerId,
          type: 'unenroll_request',
          message: `${studentData.firstName} ${studentData.lastName} (${studentData.matricNumber}) has requested to unenroll from ${courseTitle}.`,
          studentId: studentData.uid,
          studentName: `${studentData.firstName} ${studentData.lastName}`,
          matricNumber: studentData.matricNumber,
          courseId,
          courseTitle,
          status: 'pending',
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, 'notifications'), {
        userId: 'admin',
        type: 'unenroll_request',
        message: `${studentData.firstName} ${studentData.lastName} (${studentData.matricNumber}) has requested to unenroll from ${courseTitle}.`,
        studentId: studentData.uid,
        studentName: `${studentData.firstName} ${studentData.lastName}`,
        matricNumber: studentData.matricNumber,
        courseId,
        courseTitle,
        status: 'pending',
        read: false,
        createdAt: serverTimestamp(),
      });

      if (Platform.OS === 'web') {
        window.alert('Unenroll request sent! You will be notified once it is approved.');
      } else {
        Alert.alert('Request Sent', 'Your unenroll request has been sent for approval.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUnenrolling(null);
    }
  };

  const handleCancelUnenroll = (courseId: string, courseTitle: string) => {
    const doCancel = async () => {
      setCancellingUnenroll(courseId);
      try {
        // Delete all pending unenroll notifications for this student + course
        const notifRef = collection(db, 'notifications');
        const q = query(
          notifRef,
          where('studentId', '==', studentData?.uid),
          where('type', '==', 'unenroll_request'),
          where('courseId', '==', courseId),
          where('status', '==', 'pending')
        );
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'notifications', d.id))));

        if (Platform.OS === 'web') {
          window.alert('Unenroll request cancelled.');
        } else {
          Alert.alert('Cancelled', 'Your unenroll request has been cancelled.');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setCancellingUnenroll(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Cancel unenroll request for ${courseTitle}?`)) doCancel();
    } else {
      Alert.alert(
        'Cancel Request',
        `Cancel unenroll request for ${courseTitle}?`,
        [
          { text: 'No', style: 'cancel' },
          { text: 'Yes, Cancel', onPress: doCancel }
        ]
      );
    }
  };

  if (userLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={GOOD} />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {(isWeb || sidebarOpen) && (
        <Sidebar
          role="student"
          userName={studentData ? `${studentData.firstName} ${studentData.lastName}` : '...'}
          activeRoute="/screens/student/MyCourses"
        />
      )}

      <View style={styles.content}>
        <View style={styles.topBar}>
          {!isWeb && (
            <TouchableOpacity style={styles.menuButton} onPress={() => setSidebarOpen(!sidebarOpen)}>
              <Ionicons name={sidebarOpen ? 'close' : 'menu'} size={24} color={GOOD} />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>My Courses</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/screens/student/SearchCourse' as any)}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Enroll</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[GOOD]} tintColor={GOOD} />
          }
        >
          <View style={styles.infoBar}>
            <Text style={styles.infoText}>
              {courses.length} course{courses.length !== 1 ? 's' : ''} enrolled
            </Text>
          </View>

          <View style={styles.coursesList}>
            {courses.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={48} color="#D0D0D0" />
                <Text style={styles.emptyTitle}>No Courses Yet</Text>
                <Text style={styles.emptySubtitle}>Tap the Enroll button to search and join a course</Text>
                <TouchableOpacity
                  style={styles.enrollButton}
                  onPress={() => router.push('/screens/student/SearchCourse' as any)}
                >
                  <Text style={styles.enrollButtonText}>Search for Courses</Text>
                </TouchableOpacity>
              </View>
            ) : (
              courses.map((course) => {
                const isActive = !!activeSessions[course.id];
                const hasPendingUnenroll = !!pendingUnenrollRequests[course.id];

                return (
                  <View
                    key={course.id}
                    style={[
                      styles.courseCard,
                      isActive && styles.courseCardActive,
                      hasPendingUnenroll && styles.courseCardPending,
                    ]}
                  >
                    {/* Course Header */}
                    <View style={styles.courseHeader}>
                      <View style={styles.courseCodeBadge}>
                        <Text style={styles.courseCodeText}>{course.courseCode}</Text>
                      </View>
                      <View style={styles.courseHeaderRight}>
                        <Text style={styles.courseLevel}>{course.level} Level</Text>
                        {hasPendingUnenroll ? (
                          <View style={styles.pendingBadge}>
                            <Ionicons name="time-outline" size={11} color={BAD} />
                            <Text style={styles.pendingBadgeText}>PENDING</Text>
                          </View>
                        ) : isActive ? (
                          <View style={styles.liveBadge}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveText}>LIVE</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <Text style={styles.courseTitle}>{course.courseTitle}</Text>

                    {/* Pending unenroll banner */}
                    {hasPendingUnenroll && (
                      <View style={styles.pendingBanner}>
                        <Ionicons name="time-outline" size={14} color={BAD} />
                        <Text style={styles.pendingBannerText}>
                          Unenroll request sent — awaiting approval
                        </Text>
                      </View>
                    )}

                    {/* Active Session Banner — only if no pending unenroll */}
                    {isActive && !hasPendingUnenroll && (
                      <TouchableOpacity
                        style={styles.activeSessionBanner}
                        onPress={() => router.push('/screens/student/ScanQR' as any)}
                      >
                        <View style={styles.activeDot} />
                        <Text style={styles.activeSessionText}>
                          Attendance session is LIVE — Tap to scan QR
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={GOOD} />
                      </TouchableOpacity>
                    )}

                    {/* Course Details */}
                    <View style={styles.courseDetails}>
                      <View style={styles.courseDetailItem}>
                        <Ionicons name="person-outline" size={14} color="#666" />
                        <Text style={styles.courseDetailText}>{course.lecturerName}</Text>
                      </View>
                      <View style={styles.courseDetailItem}>
                        <Ionicons name="calendar-outline" size={14} color="#666" />
                        <Text style={styles.courseDetailText}>{course.semester} Semester</Text>
                      </View>
                      <View style={styles.courseDetailItem}>
                        <Ionicons name="school-outline" size={14} color="#666" />
                        <Text style={styles.courseDetailText}>{course.session}</Text>
                      </View>
                    </View>

                    {/* Unenroll / Cancel Request Button */}
                    {hasPendingUnenroll ? (
                      <TouchableOpacity
                        style={styles.cancelUnenrollButton}
                        onPress={() => handleCancelUnenroll(course.id, course.courseTitle)}
                        disabled={cancellingUnenroll === course.id}
                      >
                        {cancellingUnenroll === course.id
                          ? <ActivityIndicator size="small" color={BAD} />
                          : <>
                            <Ionicons name="close-circle-outline" size={14} color={BAD} />
                            <Text style={styles.cancelUnenrollText}>Cancel Unenroll Request</Text>
                          </>
                        }
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.unenrollButton}
                        onPress={() => handleUnenrollRequest(course.id, course.courseTitle)}
                        disabled={unenrolling === course.id}
                      >
                        {unenrolling === course.id
                          ? <ActivityIndicator size="small" color={BAD} />
                          : <Text style={styles.unenrollText}>Request Unenroll</Text>
                        }
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>

      {sidebarOpen && !isWeb && (
        <TouchableOpacity style={styles.overlay} onPress={() => setSidebarOpen(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#F5F6FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F6FA' },
  content: { flex: 1, overflow: 'hidden', minWidth: 0 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: 24, paddingVertical: 16, paddingTop: isWeb ? 15 : 50,
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 12, minHeight: isWeb ? 64 : 80,
  },
  menuButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: isWeb ? 18 : 15, fontWeight: 'bold', color: GOOD, flex: 1 },
  addButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: GOOD, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, gap: 6 },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  infoBar: { backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginBottom: 4 },
  infoText: { fontSize: 13, color: '#666' },
  coursesList: { padding: 16, gap: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: GOOD },
  emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center', paddingHorizontal: 40 },
  enrollButton: { backgroundColor: GOOD, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginTop: 8 },
  enrollButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  courseCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 20,
    borderLeftWidth: 4, borderLeftColor: GOOD,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 10, marginBottom: 12,
  },
  courseCardActive: { borderLeftColor: GOOD },
  courseCardPending: { borderLeftColor: BAD, opacity: 0.9 },
  courseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  courseHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  courseCodeBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  courseCodeText: { color: GOOD, fontWeight: '700', fontSize: 13 },
  courseLevel: { fontSize: 12, color: '#666', fontWeight: '600' },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, gap: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOOD },
  liveText: { color: GOOD, fontSize: 11, fontWeight: '700' },
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FDEDEC',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, gap: 4,
  },
  pendingBadgeText: { color: BAD, fontSize: 10, fontWeight: '700' },
  pendingBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FDEDEC', padding: 10, borderRadius: 8,
    gap: 8, borderWidth: 1, borderColor: BAD,
  },
  pendingBannerText: { fontSize: 13, fontWeight: '600', color: BAD, flex: 1 },
  activeSessionBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EEF2FF', padding: 10, borderRadius: 8,
    gap: 8, borderWidth: 1, borderColor: GOOD,
  },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GOOD },
  activeSessionText: { flex: 1, fontSize: 13, fontWeight: '700', color: GOOD },
  courseTitle: { fontSize: 16, fontWeight: '700', color: '#2D3436' },
  courseDetails: { gap: 6 },
  courseDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  courseDetailText: { fontSize: 13, color: '#666' },
  unenrollButton: {
    marginTop: 4, paddingVertical: 8, alignItems: 'center',
    borderRadius: 8, borderWidth: 1, borderColor: BAD,
  },
  unenrollText: { color: BAD, fontSize: 13, fontWeight: '600' },
  cancelUnenrollButton: {
    marginTop: 4, paddingVertical: 8, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center',
    borderRadius: 8, borderWidth: 1, borderColor: BAD,
    gap: 6, backgroundColor: '#FDEDEC',
  },
  cancelUnenrollText: { color: BAD, fontSize: 13, fontWeight: '600' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
});
