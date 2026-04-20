import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
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

const isWeb = Dimensions.get('window').width > 768;

export default function AttendanceSession() {
  const { isWeb } = useResponsive();
  const { userData: lecturerData } = useUser();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSessions, setActiveSessions] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const fetchCourses = async () => {
    if (!lecturerData?.uid) return;
    const coursesRef = collection(db, 'courses');
    const q = query(coursesRef, where('lecturerId', '==', lecturerData.uid));
    const querySnapshot = await getDocs(q);
    const courseList = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    setCourses(courseList);
    setLoading(false);
  };

  const checkActiveSessions = async (courseList: any[]) => {
    if (courseList.length === 0) return;
    const activeMap: Record<string, string> = {};
    await Promise.all(
      courseList.map(async (course) => {
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

  useEffect(() => {
    fetchCourses();
  }, [lecturerData]);

  useEffect(() => {
    if (courses.length > 0) checkActiveSessions(courses);
  }, [courses]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCourses().then(() => setRefreshing(false));
  };

  const handleCoursePress = (course: any) => {
    const count = course.enrolledStudents?.length || 0;
    const activeSessionId = activeSessions[course.id];

    // If active session exists — rejoin
    if (activeSessionId) {
      router.push({
        pathname: '/screens/lecturer/ActiveSession' as any,
        params: {
          courseId: course.id,
          courseTitle: course.courseTitle,
          courseCode: course.courseCode,
          enrolledCount: count,
          existingSessionId: activeSessionId,
        }
      });
      return;
    }

    // No active session — check enrollment before starting
    if (count === 0) {
      if (Platform.OS === 'web') {
        window.alert('No students enrolled in this course yet. Students must enroll before you can take attendance.');
      } else {
        Alert.alert(
          'No Students Enrolled',
          'Students must enroll in this course before you can take attendance.',
          [{ text: 'OK' }]
        );
      }
      return;
    }

    router.push({
      pathname: '/screens/lecturer/ActiveSession' as any,
      params: {
        courseId: course.id,
        courseTitle: course.courseTitle,
        courseCode: course.courseCode,
        enrolledCount: count,
      }
    });
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

      {/* Sidebar */}
      {(isWeb || sidebarOpen) && (
        <Sidebar
          role="lecturer"
          userName={lecturerData ? `${lecturerData.title || ''} ${lecturerData.firstName} ${lecturerData.lastName}`.trim() : '...'}
          activeRoute="/screens/lecturer/Attendance"
        />
      )}

      {/* Main Content */}
      <View style={styles.content}>

        {/* Top Bar */}
        <View style={styles.topBar}>
          {!isWeb && (
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setSidebarOpen(!sidebarOpen)}
            >
              <Ionicons
                name={sidebarOpen ? 'close' : 'menu'}
                size={24}
                color="#2C3E7A"
              />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Take Attendance</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#2C3E7A']}
              tintColor="#2C3E7A"
            />
          }
        >
          <View style={styles.infoBar}>
            <Text style={styles.infoText}>
              {Object.keys(activeSessions).length > 0
                ? `${Object.keys(activeSessions).length} active session${Object.keys(activeSessions).length > 1 ? 's' : ''} running`
                : 'Select a course to start an attendance session'
              }
            </Text>
          </View>

          <View style={styles.coursesList}>
            {courses.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={48} color="#D0D0D0" />
                <Text style={styles.emptyTitle}>No Courses Found</Text>
                <Text style={styles.emptySubtitle}>
                  Create a course first before taking attendance
                </Text>
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={() => router.push('/screens/lecturer/CreateCourse' as any)}
                >
                  <Text style={styles.createButtonText}>Create Course</Text>
                </TouchableOpacity>
              </View>
            ) : (
              courses.map((course) => {
                const isActive = !!activeSessions[course.id];
                return (
                  <TouchableOpacity
                    key={course.id}
                    style={[styles.courseCard, isActive && styles.courseCardActive]}
                    onPress={() => handleCoursePress(course)}
                  >
                    <View style={styles.courseHeader}>
                      <View style={styles.courseCodeBadge}>
                        <Text style={styles.courseCodeText}>{course.courseCode}</Text>
                      </View>
                      <View style={styles.badgeRow}>
                        <View style={styles.enrolledBadge}>
                          <Ionicons name="people-outline" size={14} color="#27AE60" />
                          <Text style={styles.enrolledText}>
                            {course.enrolledStudents?.length || 0} enrolled
                          </Text>
                        </View>
                        {isActive && (
                          <View style={styles.activeBadge}>
                            <View style={styles.activeDot} />
                            <Text style={styles.activeText}>LIVE</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <Text style={styles.courseTitle}>{course.courseTitle}</Text>

                    {/* Active session banner */}
                    {isActive && (
                      <View style={styles.activeSessionBanner}>
                        <View style={styles.activeDotLarge} />
                        <Text style={styles.activeSessionText}>
                          Session is currently active — tap to view
                        </Text>
                      </View>
                    )}

                    <View style={styles.courseFooter}>
                      <Text style={styles.courseInfo}>
                        {course.level} Level • {course.semester} Semester • {course.session}
                      </Text>
                      <View style={[
                        styles.actionButton,
                        isActive ? styles.rejoinButton : styles.startButton
                      ]}>
                        <Ionicons
                          name={isActive ? 'eye-outline' : 'play-circle-outline'}
                          size={16}
                          color="#fff"
                        />
                        <Text style={styles.actionButtonText}>
                          {isActive ? 'View Session' : 'Start Session'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

        </ScrollView>
      </View>

      {/* Mobile overlay */}
      {sidebarOpen && !isWeb && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setSidebarOpen(false)}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F5F6FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    minWidth: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 22,
    paddingTop: isWeb ? 22 : 50,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    gap: 12,
    minHeight: isWeb ? 64 : 80,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F5F6FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: isWeb ? 18 : 15,
    fontWeight: 'bold',
    color: '#2C3E7A',
    flex: 1,
  },
  infoBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
  },
  coursesList: {
    padding: 16,
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E7A',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  createButton: {
    backgroundColor: '#2C3E7A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  courseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#2C3E7A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
    marginBottom: 12,
  },
  courseCardActive: {
    borderLeftColor: '#27AE60',
  },
  courseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  courseCodeBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  courseCodeText: {
    color: '#2C3E7A',
    fontWeight: '700',
    fontSize: 13,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  enrolledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  enrolledText: {
    fontSize: 12,
    color: '#27AE60',
    fontWeight: '600',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAFAF1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#27AE60',
  },
  activeDotLarge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#27AE60',
  },
  activeText: {
    color: '#27AE60',
    fontSize: 11,
    fontWeight: '700',
  },
  activeSessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAFAF1',
    padding: 10,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#27AE60',
  },
  activeSessionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#27AE60',
    flex: 1,
  },
  courseTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3436',
  },
  courseFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  courseInfo: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  startButton: {
    backgroundColor: '#2C3E7A',
  },
  rejoinButton: {
    backgroundColor: '#27AE60',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
});