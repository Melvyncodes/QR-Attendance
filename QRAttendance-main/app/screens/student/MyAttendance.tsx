import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useResponsive } from '@/hooks/useResponsive';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../../../firebase';

const isWeb = Dimensions.get('window').width > 768;

const GOOD = '#2C3E7A';
const BAD = '#E74C3C';

export default function MyAttendance() {
  const { userData: studentData } = useUser();
  const [courseStats, setCourseStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isWeb } = useResponsive();
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [overallStats, setOverallStats] = useState({ totalSessions: 0, present: 0, percentage: 0 });

  const fetchAttendance = async () => {
    if (!studentData?.uid) return;
    try {
      // Get enrolled courses
      const coursesRef = collection(db, 'courses');
      const coursesQ = query(coursesRef, where('enrolledStudents', 'array-contains', studentData.uid));
      const coursesSnap = await getDocs(coursesQ);
      const enrolledCourses = coursesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      // Get all attendance records for this student
      const attendanceRef = collection(db, 'attendance');
      const attQ = query(attendanceRef, where('studentId', '==', studentData.uid));
      const attSnap = await getDocs(attQ);
      const allRecords = attSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      // For each enrolled course, count total closed sessions and student's present count
      const statsArray = await Promise.all(
        enrolledCourses.map(async (course: any) => {
          // Total sessions run by lecturer for this course (closed = ended)
          const sessionsRef = collection(db, 'sessions');
          const sessQ = query(
            sessionsRef,
            where('courseId', '==', course.id),
            where('status', '==', 'closed')
          );
          const sessSnap = await getDocs(sessQ);
          const totalSessions = sessSnap.size;

          // Student's present records for this course — deduplicate by sessionId
          const courseRecords = allRecords.filter(r => r.courseId === course.id);
          const uniquePresent = new Map();
          courseRecords.filter(r => r.status === 'present').forEach(r => {
            if (r.sessionId && !uniquePresent.has(r.sessionId)) {
              uniquePresent.set(r.sessionId, r);
            } else if (!r.sessionId) {
              uniquePresent.set(r.id, r);
            }
          });
          const presentCount = Math.min(uniquePresent.size, totalSessions);

          // Percentage out of total sessions run — capped at 100
          const percentage = totalSessions > 0
            ? Math.min(100, Math.round((presentCount / totalSessions) * 100))
            : 0;

          return {
            courseId: course.id,
            courseCode: course.courseCode,
            courseTitle: course.courseTitle,
            lecturerName: course.lecturerName,
            totalSessions,
            present: presentCount,
            absent: totalSessions - presentCount,
            percentage,
            records: courseRecords.sort((a: any, b: any) => {
              const aTime = a.timestamp?.toDate?.() || new Date(0);
              const bTime = b.timestamp?.toDate?.() || new Date(0);
              return bTime - aTime;
            }),
          };
        })
      );

      setCourseStats(statsArray);

      // Overall across all courses
      const totalSessions = statsArray.reduce((sum, c) => sum + c.totalSessions, 0);
      const totalPresent = statsArray.reduce((sum, c) => sum + c.present, 0);
      const overallPct = totalSessions > 0
        ? Math.round((totalPresent / totalSessions) * 100)
        : 0;

      setOverallStats({ totalSessions, present: totalPresent, percentage: overallPct });

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAttendance(); }, [studentData]);

  const onRefresh = () => { setRefreshing(true); fetchAttendance(); };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const selectedCourseData = courseStats.find(c => c.courseId === selectedCourse);

  if (loading) {
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
          activeRoute="/screens/student/MyAttendance"
        />
      )}

      <View style={styles.content}>
        <View style={styles.topBar}>
          {!isWeb && (
            <TouchableOpacity style={styles.menuButton} onPress={() => setSidebarOpen(!sidebarOpen)}>
              <Ionicons name={sidebarOpen ? 'close' : 'menu'} size={24} color={GOOD} />
            </TouchableOpacity>
          )}
          {selectedCourse && (
            <TouchableOpacity onPress={() => setSelectedCourse(null)}>
              <Ionicons name="arrow-back" size={24} color={GOOD} />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>
            {selectedCourse ? selectedCourseData?.courseCode : 'My Attendance'}
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[GOOD]} tintColor={GOOD} />
          }
        >
          {!selectedCourse ? (
            /* ── Overview ── */
            <View>
              {/* Overall card */}
              <View style={styles.overallCard}>
                <Text style={styles.overallTitle}>Overall Attendance</Text>
                <Text style={styles.overallNote}>
                  Calculated from total classes conducted by your lecturers
                </Text>
                <View style={styles.overallStats}>
                  <View style={styles.overallStat}>
                    <Text style={styles.overallNumber}>{overallStats.totalSessions}</Text>
                    <Text style={styles.overallLabel}>Total Classes</Text>
                  </View>
                  <View style={styles.overallStat}>
                    <Text style={[styles.overallNumber, { color: GOOD }]}>{overallStats.present}</Text>
                    <Text style={styles.overallLabel}>Attended</Text>
                  </View>
                  <View style={styles.overallStat}>
                    <Text style={[
                      styles.overallNumber,
                      { color: overallStats.percentage >= 75 ? GOOD : BAD }
                    ]}>
                      {overallStats.percentage}%
                    </Text>
                    <Text style={styles.overallLabel}>Overall</Text>
                  </View>
                </View>
                <View style={styles.progressBar}>
                  <View style={[
                    styles.progressFill,
                    {
                      width: `${overallStats.percentage}%` as any,
                      backgroundColor: overallStats.percentage >= 75 ? GOOD : BAD
                    }
                  ]} />
                </View>
                <Text style={[
                  styles.statusText,
                  { color: overallStats.percentage >= 75 ? GOOD : BAD }
                ]}>
                  {overallStats.percentage >= 75
                    ? 'Good standing - above 75% threshold'
                    : 'Below 75% threshold - Needs improvement'}
                </Text>
              </View>

              {/* Per course */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Attendance Per Course</Text>
                {courseStats.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="book-outline" size={48} color="#D0D0D0" />
                    <Text style={styles.emptyTitle}>No Courses Enrolled</Text>
                    <Text style={styles.emptySubtitle}>Enroll in courses to track your attendance</Text>
                  </View>
                ) : (
                  courseStats.map((course) => (
                    <TouchableOpacity
                      key={course.courseId}
                      style={[
                        styles.courseCard,
                        { borderLeftColor: course.percentage >= 75 ? GOOD : BAD }
                      ]}
                      onPress={() => setSelectedCourse(course.courseId)}
                    >
                      <View style={styles.courseCardHeader}>
                        <View style={styles.courseCodeBadge}>
                          <Text style={styles.courseCodeText}>{course.courseCode}</Text>
                        </View>
                        <View style={[
                          styles.percentageBadge,
                          { backgroundColor: course.percentage >= 75 ? '#EEF2FF' : '#FDEDEC' }
                        ]}>
                          <Text style={[
                            styles.percentageText,
                            { color: course.percentage >= 75 ? GOOD : BAD }
                          ]}>
                            {course.percentage}%
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.courseTitle}>{course.courseTitle}</Text>
                      <Text style={styles.lecturerName}>{course.lecturerName}</Text>

                      <View style={styles.courseProgressBar}>
                        <View style={[
                          styles.courseProgressFill,
                          {
                            width: `${course.percentage}%` as any,
                            backgroundColor: course.percentage >= 75 ? GOOD : BAD
                          }
                        ]} />
                      </View>

                      <View style={styles.courseStats}>
                        <Text style={styles.courseStatText}>
                          {course.present}/{course.totalSessions} classes attended
                        </Text>
                        <Text style={[
                          styles.courseStatus,
                          { color: course.percentage >= 75 ? GOOD : BAD }
                        ]}>
                          {course.percentage >= 75 ? 'Good Standing' : 'Below 75%'}
                        </Text>
                      </View>

                      <View style={styles.viewDetails}>
                        <Text style={[styles.viewDetailsText, { color: GOOD }]}>View Details</Text>
                        <Ionicons name="chevron-forward" size={16} color={GOOD} />
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>
          ) : (
            /* ── Course Detail ── */
            <View>
              <View style={styles.overallCard}>
                <Text style={styles.overallTitle}>{selectedCourseData?.courseTitle}</Text>
                <Text style={styles.lecturerName}>{selectedCourseData?.lecturerName}</Text>
                <Text style={styles.overallNote}>
                  Percentage calculated from {selectedCourseData?.totalSessions} total class{selectedCourseData?.totalSessions !== 1 ? 'es' : ''} conducted
                </Text>

                <View style={styles.overallStats}>
                  <View style={styles.overallStat}>
                    <Text style={styles.overallNumber}>{selectedCourseData?.totalSessions}</Text>
                    <Text style={styles.overallLabel}>Total Classes</Text>
                  </View>
                  <View style={styles.overallStat}>
                    <Text style={[styles.overallNumber, { color: GOOD }]}>{selectedCourseData?.present}</Text>
                    <Text style={styles.overallLabel}>Attended</Text>
                  </View>
                  <View style={styles.overallStat}>
                    <Text style={[styles.overallNumber, { color: BAD }]}>{selectedCourseData?.absent}</Text>
                    <Text style={styles.overallLabel}>Missed</Text>
                  </View>
                  <View style={styles.overallStat}>
                    <Text style={[
                      styles.overallNumber,
                      { color: (selectedCourseData?.percentage || 0) >= 75 ? GOOD : BAD }
                    ]}>
                      {selectedCourseData?.percentage}%
                    </Text>
                    <Text style={styles.overallLabel}>Score</Text>
                  </View>
                </View>

                <View style={styles.progressBar}>
                  <View style={[
                    styles.progressFill,
                    {
                      width: `${selectedCourseData?.percentage}%` as any,
                      backgroundColor: (selectedCourseData?.percentage || 0) >= 75 ? GOOD : BAD
                    }
                  ]} />
                </View>

                {/* 75% threshold marker */}
                <View style={styles.thresholdRow}>
                  <View style={styles.thresholdLine} />
                  <Text style={styles.thresholdLabel}>75% threshold</Text>
                </View>

                <Text style={[
                  styles.statusText,
                  { color: (selectedCourseData?.percentage || 0) >= 75 ? GOOD : BAD }
                ]}>
                  {(selectedCourseData?.percentage || 0) >= 75
                    ? 'You are in good standing for this course'
                    : `You need ${75 - (selectedCourseData?.percentage || 0)}% more to reach the 75% threshold`}
                </Text>
              </View>

              {/* Records */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Attendance Records</Text>
                {selectedCourseData?.totalSessions === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No Sessions Yet</Text>
                    <Text style={styles.emptySubtitle}>
                      Your lecturer hasn't conducted any sessions for this course yet
                    </Text>
                  </View>
                ) : selectedCourseData?.records.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No Records Yet</Text>
                    <Text style={styles.emptySubtitle}>
                      Scan a QR code in class to mark your attendance
                    </Text>
                    <TouchableOpacity
                      style={styles.scanButton}
                      onPress={() => router.push('/screens/student/ScanQR' as any)}
                    >
                      <Ionicons name="qr-code-outline" size={16} color="#fff" />
                      <Text style={styles.scanButtonText}>Scan QR Code</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  selectedCourseData?.records.map((record: any) => (
                    <View key={record.id} style={styles.recordCard}>
                      <View style={[
                        styles.statusDot,
                        { backgroundColor: record.status === 'present' ? GOOD : BAD }
                      ]} />
                      <View style={styles.recordInfo}>
                        <Text style={styles.recordDate}>{formatDate(record.timestamp)}</Text>
                        <View style={styles.recordMethod}>
                          <Ionicons
                            name={record.method === 'QR' ? 'qr-code-outline' : 'card-outline'}
                            size={12}
                            color="#999"
                          />
                          <Text style={styles.recordMethodText}>via {record.method}</Text>
                        </View>
                      </View>
                      <View style={[
                        styles.statusBadge,
                        { backgroundColor: record.status === 'present' ? '#EEF2FF' : '#FDEDEC' }
                      ]}>
                        <Text style={[
                          styles.statusBadgeText,
                          { color: record.status === 'present' ? GOOD : BAD }
                        ]}>
                          {record.status?.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
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
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: isWeb ? 20 : 16, paddingTop: isWeb ? 20 : 50, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 12, minHeight: isWeb ? 69 : 80 },
  menuButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: isWeb ? 18 : 15, fontWeight: 'bold', color: GOOD, flex: 1 },
  overallCard: { backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4, gap: 10 },
  overallTitle: { fontSize: 16, fontWeight: 'bold', color: GOOD },
  overallNote: { fontSize: 12, color: '#888', fontStyle: 'italic' },
  overallStats: { flexDirection: 'row', justifyContent: 'space-around' },
  overallStat: { alignItems: 'center', gap: 4 },
  overallNumber: { fontSize: 24, fontWeight: 'bold', color: GOOD },
  overallLabel: { fontSize: 11, color: '#666' },
  progressBar: { height: 10, backgroundColor: '#E0E0E0', borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  thresholdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thresholdLine: { flex: 1, height: 1, backgroundColor: '#E0E0E0' },
  thresholdLabel: { fontSize: 11, color: '#999' },
  statusText: { fontSize: 13, fontWeight: '600' },
  section: { paddingHorizontal: 16, paddingBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: GOOD, marginBottom: 12 },
  courseCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 8 },
  courseCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  courseCodeBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  courseCodeText: { color: GOOD, fontWeight: '700', fontSize: 13 },
  percentageBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  percentageText: { fontWeight: '700', fontSize: 14 },
  courseTitle: { fontSize: 15, fontWeight: '700', color: '#2D3436' },
  lecturerName: { fontSize: 12, color: '#666' },
  courseProgressBar: { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, overflow: 'hidden' },
  courseProgressFill: { height: '100%', borderRadius: 3 },
  courseStats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  courseStatText: { fontSize: 12, color: '#666' },
  courseStatus: { fontSize: 12, fontWeight: '600' },
  viewDetails: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  viewDetailsText: { fontSize: 13, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: GOOD },
  emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center', paddingHorizontal: 40 },
  scanButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: GOOD, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, gap: 8, marginTop: 8 },
  scanButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  recordCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  recordInfo: { flex: 1, gap: 2 },
  recordDate: { fontSize: 13, color: '#2D3436', fontWeight: '600' },
  recordMethod: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recordMethodText: { fontSize: 11, color: '#999' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
});
