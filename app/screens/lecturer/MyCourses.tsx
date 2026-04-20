import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { addDoc, arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
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

export default function LecturerMyCourses() {
  const { isWeb } = useResponsive();
  const { userData: lecturerData } = useUser();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(isWeb);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSessions, setActiveSessions] = useState<Record<string, string>>({});
  const [requestingDelete, setRequestingDelete] = useState<string | null>(null);
  const [cancellingDelete, setCancellingDelete] = useState<string | null>(null);
  const [pendingDeleteRequests, setPendingDeleteRequests] = useState<Record<string, string>>({});
  const [pendingUnenrollMap, setPendingUnenrollMap] = useState<Record<string, string>>({});
  const [processingUnenroll, setProcessingUnenroll] = useState<string | null>(null);

  // Real-time courses listener
  useEffect(() => {
    if (!lecturerData?.uid) return;
    const q = query(collection(db, 'courses'), where('lecturerId', '==', lecturerData.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const courseList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setCourses(courseList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [lecturerData?.uid]);

  // Real-time pending delete requests listener
  useEffect(() => {
    if (!lecturerData?.uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('lecturerId', '==', lecturerData.uid),
      where('type', '==', 'delete_course_request'),
      where('status', '==', 'pending')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const requestMap: Record<string, string> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.courseId) requestMap[data.courseId] = d.id;
      });
      setPendingDeleteRequests(requestMap);
    });
    return () => unsubscribe();
  }, [lecturerData?.uid]);

  // Real-time pending unenroll requests for the open modal course
  useEffect(() => {
    if (!selectedCourse?.id || !lecturerData?.uid) {
      setPendingUnenrollMap({});
      return;
    }
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', lecturerData.uid),
      where('type', '==', 'unenroll_request'),
      where('courseId', '==', selectedCourse.id),
      where('status', '==', 'pending')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.studentId) map[data.studentId] = d.id;
      });
      setPendingUnenrollMap(map);
    });
    return () => unsubscribe();
  }, [selectedCourse?.id, lecturerData?.uid]);

  // Check active sessions whenever courses update
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

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleTakeAttendance = (course: any) => {
    const activeSessionId = activeSessions[course.id];
    router.push({
      pathname: '/screens/lecturer/ActiveSession' as any,
      params: {
        courseId: course.id,
        courseTitle: course.courseTitle,
        courseCode: course.courseCode,
        enrolledCount: course.enrolledStudents?.length || 0,
        ...(activeSessionId ? { existingSessionId: activeSessionId } : {}),
      }
    });
  };

  const handleViewStudents = async (course: any) => {
    setSelectedCourse(course);
    setModalVisible(true);
    setLoadingStudents(true);
    setEnrolledStudents([]);
    try {
      if (!course.enrolledStudents || course.enrolledStudents.length === 0) {
        setLoadingStudents(false);
        return;
      }
      const studentProfiles = await Promise.all(
        course.enrolledStudents.map(async (uid: string) => {
          const docSnap = await getDoc(doc(db, 'users', uid));
          return docSnap.exists() ? { uid, ...docSnap.data() } : null;
        })
      );
      setEnrolledStudents(studentProfiles.filter(Boolean));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleUnenrollStudent = async (student: any, approve: boolean) => {
    const notifId = pendingUnenrollMap[student.uid];
    if (!notifId) return;
    setProcessingUnenroll(student.uid);
    try {
      if (approve) {
        await updateDoc(doc(db, 'courses', selectedCourse.id), {
          enrolledStudents: arrayRemove(student.uid),
        });
        await updateDoc(doc(db, 'notifications', notifId), {
          status: 'approved', read: true, resolvedAt: serverTimestamp(),
        });
        await addDoc(collection(db, 'notifications'), {
          userId: student.uid,
          type: 'unenroll_approved',
          message: `Your request to unenroll from ${selectedCourse.courseTitle} has been approved by your lecturer.`,
          courseId: selectedCourse.id,
          courseTitle: selectedCourse.courseTitle,
          read: false,
          createdAt: serverTimestamp(),
        });
        // Remove from local enrolled list immediately
        setEnrolledStudents(prev => prev.filter(s => s.uid !== student.uid));
      } else {
        await updateDoc(doc(db, 'notifications', notifId), {
          status: 'rejected', read: true, resolvedAt: serverTimestamp(),
        });
        await addDoc(collection(db, 'notifications'), {
          userId: student.uid,
          type: 'unenroll_rejected',
          message: `Your request to unenroll from ${selectedCourse.courseTitle} has been rejected by your lecturer.`,
          courseId: selectedCourse.id,
          courseTitle: selectedCourse.courseTitle,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingUnenroll(null);
    }
  };

  const handleDeleteRequest = async (course: any) => {
    const submitRequest = async () => {
      setRequestingDelete(course.id);
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: 'admin',
          type: 'delete_course_request',
          message: `${lecturerData?.title || ''} ${lecturerData?.firstName} ${lecturerData?.lastName} has requested to delete course ${course.courseCode} - ${course.courseTitle}.`,
          courseId: course.id,
          courseCode: course.courseCode,
          courseTitle: course.courseTitle,
          lecturerId: lecturerData?.uid,
          lecturerName: `${lecturerData?.title || ''} ${lecturerData?.firstName} ${lecturerData?.lastName}`.trim(),
          status: 'pending',
          read: false,
          createdAt: serverTimestamp(),
        });
        if (Platform.OS === 'web') {
          window.alert('Delete request sent to admin for approval.');
        } else {
          Alert.alert('Request Sent', 'Your delete request has been sent to admin for approval.');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setRequestingDelete(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Request to delete ${course.courseCode} - ${course.courseTitle}?\n\nThis requires admin approval.`)) {
        submitRequest();
      }
    } else {
      Alert.alert(
        'Delete Course',
        `Request to delete ${course.courseCode} - ${course.courseTitle}?\n\nThis requires admin approval.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Request Delete', style: 'destructive', onPress: submitRequest }
        ]
      );
    }
  };

  const handleCancelDeleteRequest = async (course: any) => {
    const notifId = pendingDeleteRequests[course.id];
    if (!notifId) return;
    setCancellingDelete(course.id);
    try {
      await deleteDoc(doc(db, 'notifications', notifId));
    } catch (err) {
      console.error(err);
    } finally {
      setCancellingDelete(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2C3E7A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {(isWeb || sidebarOpen) && (
        <Sidebar
          role="lecturer"
          userName={lecturerData ? `${lecturerData.title || ''} ${lecturerData.firstName} ${lecturerData.lastName}`.trim() : '...'}
          activeRoute="/screens/lecturer/MyCourses"
        />
      )}

      <View style={styles.content}>
        <View style={styles.topBar}>
          {!isWeb && (
            <TouchableOpacity style={styles.menuButton} onPress={() => setSidebarOpen(!sidebarOpen)}>
              <Ionicons name={sidebarOpen ? 'close' : 'menu'} size={24} color="#2C3E7A" />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>My Courses</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/screens/lecturer/CreateCourse' as any)}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>New Course</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2C3E7A']} tintColor="#2C3E7A" />
          }
        >
          <View style={styles.infoBar}>
            <Text style={styles.infoText}>
              {courses.length} course{courses.length !== 1 ? 's' : ''} created
            </Text>
          </View>

          <View style={styles.coursesList}>
            {courses.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={48} color="#D0D0D0" />
                <Text style={styles.emptyTitle}>No Courses Yet</Text>
                <Text style={styles.emptySubtitle}>Tap New Course to create your first course</Text>
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={() => router.push('/screens/lecturer/CreateCourse' as any)}
                >
                  <Text style={styles.createButtonText}>Create Course</Text>
                </TouchableOpacity>
              </View>
            ) : (
              courses.map((course) => {
                const hasPendingDelete = !!pendingDeleteRequests[course.id];
                const isActive = !!activeSessions[course.id];

                return (
                  <View
                    key={course.id}
                    style={[
                      styles.courseCard,
                      isActive && styles.courseCardActive,
                      hasPendingDelete && styles.courseCardPendingDelete,
                    ]}
                  >
                    <View style={styles.courseHeader}>
                      <View style={styles.courseCodeBadge}>
                        <Text style={styles.courseCodeText}>{course.courseCode}</Text>
                      </View>
                      <View style={styles.courseHeaderRight}>
                        <Text style={styles.courseLevel}>{course.level} Level</Text>
                        {hasPendingDelete ? (
                          <View style={styles.pendingDeleteBadge}>
                            <Ionicons name="time-outline" size={11} color="#F39C12" />
                            <Text style={styles.pendingDeleteBadgeText}>PENDING DELETE</Text>
                          </View>
                        ) : isActive ? (
                          <View style={styles.activeBadge}>
                            <View style={styles.activeDot} />
                            <Text style={styles.activeText}>LIVE</Text>
                          </View>
                        ) : (
                          <View style={styles.statusBadge}>
                            <Text style={styles.statusText}>{course.status}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <Text style={styles.courseTitle}>{course.courseTitle}</Text>

                    {hasPendingDelete && (
                      <View style={styles.pendingDeleteBanner}>
                        <Ionicons name="time-outline" size={14} color="#F39C12" />
                        <Text style={styles.pendingDeleteBannerText}>
                          Delete request sent — awaiting admin approval
                        </Text>
                      </View>
                    )}

                    {isActive && !hasPendingDelete && (
                      <View style={styles.activeSessionBanner}>
                        <View style={styles.activeDotLarge} />
                        <Text style={styles.activeSessionText}>Attendance session is currently active</Text>
                      </View>
                    )}

                    <View style={styles.courseDetails}>
                      <View style={styles.courseDetailItem}>
                        <Ionicons name="people-outline" size={14} color="#666" />
                        <Text style={styles.courseDetailText}>
                          {course.enrolledStudents?.length || 0} students enrolled
                        </Text>
                      </View>
                      <View style={styles.courseDetailItem}>
                        <Ionicons name="calendar-outline" size={14} color="#666" />
                        <Text style={styles.courseDetailText}>
                          {course.semester} Semester | {course.session}
                        </Text>
                      </View>
                      <View style={styles.courseDetailItem}>
                        <Ionicons name="id-card-outline" size={14} color="#666" />
                        <Text style={styles.courseDetailText}>Course ID: {course.courseId}</Text>
                      </View>
                    </View>

                    {!hasPendingDelete && (
                      <View style={styles.courseActions}>
                        <TouchableOpacity style={styles.actionButton} onPress={() => handleViewStudents(course)}>
                          <Ionicons name="people-outline" size={16} color="#2C3E7A" />
                          <Text style={styles.actionButtonText}>View Students</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButton, isActive ? styles.viewSessionButton : styles.attendanceButton]}
                          onPress={() => handleTakeAttendance(course)}
                        >
                          <Ionicons
                            name={isActive ? 'eye-outline' : 'checkmark-circle-outline'}
                            size={16}
                            color="#fff"
                          />
                          <Text style={[styles.actionButtonText, { color: '#fff' }]}>
                            {isActive ? 'View Session' : 'Take Attendance'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {hasPendingDelete ? (
                      <TouchableOpacity
                        style={styles.cancelDeleteButton}
                        onPress={() => handleCancelDeleteRequest(course)}
                        disabled={cancellingDelete === course.id}
                      >
                        {cancellingDelete === course.id
                          ? <ActivityIndicator size="small" color="#F39C12" />
                          : <>
                            <Ionicons name="close-circle-outline" size={14} color="#F39C12" />
                            <Text style={styles.cancelDeleteButtonText}>Cancel Delete Request</Text>
                          </>
                        }
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDeleteRequest(course)}
                        disabled={requestingDelete === course.id}
                      >
                        {requestingDelete === course.id
                          ? <ActivityIndicator size="small" color="#E74C3C" />
                          : <>
                            <Ionicons name="trash-outline" size={14} color="#E74C3C" />
                            <Text style={styles.deleteButtonText}>Request Delete</Text>
                          </>
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

      {/* Students Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{selectedCourse?.courseTitle}</Text>
                <Text style={styles.modalSubtitle}>
                  {enrolledStudents.length} student{enrolledStudents.length !== 1 ? 's' : ''} enrolled
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setModalVisible(false); setSelectedCourse(null); }}>
                <Ionicons name="close" size={24} color="#2C3E7A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {loadingStudents ? (
                <ActivityIndicator size="large" color="#2C3E7A" style={{ marginTop: 40 }} />
              ) : enrolledStudents.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color="#D0D0D0" />
                  <Text style={styles.emptyTitle}>No Students Yet</Text>
                  <Text style={styles.emptySubtitle}>No students have enrolled in this course yet</Text>
                </View>
              ) : (
                enrolledStudents.map((student, index) => {
                  const hasPendingUnenroll = !!pendingUnenrollMap[student.uid];
                  return (
                    <View
                      key={student.uid}
                      style={[styles.studentRow, hasPendingUnenroll && styles.studentRowPending]}
                    >
                      <View style={styles.studentNumber}>
                        <Text style={styles.studentNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.studentInfo}>
                        <Text style={styles.studentName}>
                          {`${student.firstName} ${student.lastName}`.toUpperCase()}
                        </Text>
                        <Text style={styles.studentMatric}>{student.matricNumber}</Text>
                        {hasPendingUnenroll && (
                          <View style={styles.unenrollRequestTag}>
                            <Ionicons name="time-outline" size={11} color="#F39C12" />
                            <Text style={styles.unenrollRequestTagText}>Requested unenroll</Text>
                          </View>
                        )}
                      </View>
                      {hasPendingUnenroll ? (
                        processingUnenroll === student.uid ? (
                          <ActivityIndicator size="small" color="#2C3E7A" />
                        ) : (
                          <View style={styles.unenrollActions}>
                            <TouchableOpacity
                              style={styles.unenrollRejectBtn}
                              onPress={() => handleUnenrollStudent(student, false)}
                            >
                              <Ionicons name="close" size={14} color="#E74C3C" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.unenrollApproveBtn}
                              onPress={() => handleUnenrollStudent(student, true)}
                            >
                              <Ionicons name="checkmark" size={14} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        )
                      ) : (
                        <Text style={styles.studentDept}>{student.department}</Text>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#F5F6FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F6FA' },
  content: { flex: 1, overflow: 'hidden', minWidth: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 8, paddingTop: isWeb ? 22 : 50, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 12, minHeight: isWeb ? 64 : 80 },
  menuButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: isWeb ? 18 : 15, fontWeight: 'bold', color: '#2C3E7A', flex: 1 },
  addButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2C3E7A', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, gap: 6 },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  infoBar: { backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginBottom: 4 },
  infoText: { fontSize: 13, color: '#666' },
  coursesList: { padding: 16, gap: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E7A' },
  emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center', paddingHorizontal: 40 },
  createButton: { backgroundColor: '#2C3E7A', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginTop: 8 },
  createButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  courseCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, borderLeftWidth: 4, borderLeftColor: '#2C3E7A', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 12, marginBottom: 12 },
  courseCardActive: { borderLeftColor: '#2C3E7A' },
  courseCardPendingDelete: { borderLeftColor: '#F39C12', opacity: 0.9 },
  courseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  courseCodeBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  courseCodeText: { color: '#2C3E7A', fontWeight: '700', fontSize: 13 },
  courseHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  courseLevel: { fontSize: 12, color: '#666', fontWeight: '600' },
  statusBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { color: '#2C3E7A', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  activeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, gap: 4 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2C3E7A' },
  activeDotLarge: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2C3E7A' },
  activeText: { color: '#2C3E7A', fontSize: 11, fontWeight: '700' },
  pendingDeleteBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF9E7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, gap: 4 },
  pendingDeleteBadgeText: { color: '#F39C12', fontSize: 10, fontWeight: '700' },
  pendingDeleteBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF9E7', padding: 10, borderRadius: 8, gap: 8, borderWidth: 1, borderColor: '#F39C12' },
  pendingDeleteBannerText: { fontSize: 13, fontWeight: '600', color: '#F39C12', flex: 1 },
  activeSessionBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', padding: 10, borderRadius: 8, gap: 8, borderWidth: 1, borderColor: '#2C3E7A' },
  activeSessionText: { fontSize: 13, fontWeight: '600', color: '#2C3E7A', flex: 1 },
  courseTitle: { fontSize: 16, fontWeight: '700', color: '#2D3436' },
  courseDetails: { gap: 6 },
  courseDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  courseDetailText: { fontSize: 13, color: '#666' },
  courseActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2C3E7A', gap: 6 },
  attendanceButton: { backgroundColor: '#2C3E7A', borderColor: '#2C3E7A' },
  viewSessionButton: { backgroundColor: '#2C3E7A', borderColor: '#2C3E7A' },
  actionButtonText: { fontSize: 13, fontWeight: '600', color: '#2C3E7A' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E74C3C', gap: 6, marginTop: 4 },
  deleteButtonText: { color: '#E74C3C', fontSize: 13, fontWeight: '600' },
  cancelDeleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#F39C12', gap: 6, marginTop: 4 },
  cancelDeleteButtonText: { color: '#F39C12', fontSize: 13, fontWeight: '600' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: isWeb ? 600 : '100%', maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E7A' },
  modalSubtitle: { fontSize: 13, color: '#666', marginTop: 4 },
  studentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F6FA', gap: 12 },
  studentRowPending: { backgroundColor: '#FFFDF0', borderRadius: 8, paddingHorizontal: 8 },
  studentNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  studentNumberText: { fontSize: 12, fontWeight: '700', color: '#2C3E7A' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '600', color: '#2D3436' },
  studentMatric: { fontSize: 12, color: '#666', marginTop: 2 },
  studentDept: { fontSize: 12, color: '#666' },
  unenrollRequestTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  unenrollRequestTagText: { fontSize: 11, color: '#F39C12', fontWeight: '600' },
  unenrollActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  unenrollRejectBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FDEDEC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E74C3C' },
  unenrollApproveBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#2C3E7A', justifyContent: 'center', alignItems: 'center' },
});
