import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { arrayUnion, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../../../firebase';

const screenWidth = Dimensions.get('window').width;
const isWeb = screenWidth > 768;

export default function SearchCourse() {
  const { userData: studentData } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [enrolledCourses, setEnrolledCourses] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(isWeb);
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [fetchingCourses, setFetchingCourses] = useState(true);

  // Fetch all courses once
  useEffect(() => {
    const fetchAllCourses = async () => {
      const coursesRef = collection(db, 'courses');
      const querySnapshot = await getDocs(coursesRef);
      const courseList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllCourses(courseList);
      setResults(courseList); // show all courses immediately
      setFetchingCourses(false);
    };
    fetchAllCourses();
  }, []);

  // Fetch already enrolled courses
  useEffect(() => {
    if (!studentData?.uid) return;
    const fetchEnrolled = async () => {
      const coursesRef = collection(db, 'courses');
      const q = query(coursesRef, where('enrolledStudents', 'array-contains', studentData.uid));
      const querySnapshot = await getDocs(q);
      setEnrolledCourses(querySnapshot.docs.map(d => d.id));
    };
    fetchEnrolled();
  }, [studentData]);

  // Live search filter
  useEffect(() => {
    if (fetchingCourses) return;
    if (!searchQuery.trim()) {
      setResults(allCourses);
      return;
    }
    const q = searchQuery.trim().toLowerCase();
    const filtered = allCourses.filter(course =>
      course.courseCode?.toLowerCase().includes(q) ||
      course.courseTitle?.toLowerCase().includes(q) ||
      course.lecturerName?.toLowerCase().includes(q) ||
      course.department?.toLowerCase().includes(q) ||
      course.session?.toLowerCase().includes(q)
    );
    setResults(filtered);
  }, [searchQuery, allCourses, fetchingCourses]);

  const handleEnroll = async (courseId: string) => {
    if (!studentData?.uid) return;
    setEnrolling(courseId);
    try {
      const courseRef = doc(db, 'courses', courseId);
      await updateDoc(courseRef, {
        enrolledStudents: arrayUnion(studentData.uid)
      });
      setEnrolledCourses(prev => [...prev, courseId]);
    } catch (err) {
      console.error(err);
    } finally {
      setEnrolling(null);
    }
  };

  return (
    <View style={styles.container}>

      {/* Sidebar */}
      {sidebarOpen && (
        <Sidebar
          role="student"
          userName={studentData ? `${studentData.firstName} ${studentData.lastName}` : '...'}
          activeRoute="/screens/student/MyCourses"
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
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#2C3E7A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Search Courses</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={20} color="#999" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by course code, title, lecturer..."
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#999" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Results */}
          <View style={styles.resultsList}>
            {fetchingCourses ? (
              <ActivityIndicator size="large" color="#2C3E7A" style={{ marginTop: 40 }} />
            ) : results.length === 0 && searchQuery.length > 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={48} color="#D0D0D0" />
                <Text style={styles.emptyTitle}>No Courses Found</Text>
                <Text style={styles.emptySubtitle}>
                  Try searching with a different course code or title
                </Text>
              </View>
            ) : results.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={48} color="#D0D0D0" />
                <Text style={styles.emptyTitle}>No Courses Available</Text>
                <Text style={styles.emptySubtitle}>
                  No courses have been created yet
                </Text>
              </View>
            ) : (
              results.map((course) => (
                <View key={course.id} style={styles.courseCard}>
                  <View style={styles.courseHeader}>
                    <View style={styles.courseCodeBadge}>
                      <Text style={styles.courseCodeText}>{course.courseCode}</Text>
                    </View>
                    <Text style={styles.courseLevel}>{course.level} Level</Text>
                  </View>
                  <Text style={styles.courseTitle}>{course.courseTitle}</Text>
                  <View style={styles.courseDetails}>
                    <View style={styles.courseDetailItem}>
                      <Ionicons name="person-outline" size={14} color="#666" />
                      <Text style={styles.courseDetailText}>{course.lecturerName}</Text>
                    </View>
                    <View style={styles.courseDetailItem}>
                      <Ionicons name="business-outline" size={14} color="#666" />
                      <Text style={styles.courseDetailText}>{course.department}</Text>
                    </View>
                    <View style={styles.courseDetailItem}>
                      <Ionicons name="calendar-outline" size={14} color="#666" />
                      <Text style={styles.courseDetailText}>
                        {course.semester} Semester | {course.session}
                      </Text>
                    </View>
                  </View>

                  {enrolledCourses.includes(course.id) ? (
                    <View style={styles.enrolledBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
                      <Text style={styles.enrolledText}>Already Enrolled</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.enrollButton}
                      onPress={() => handleEnroll(course.id)}
                      disabled={enrolling === course.id}
                    >
                      {enrolling === course.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.enrollButtonText}>Enroll in Course</Text>
                      }
                    </TouchableOpacity>
                  )}
                </View>
              ))
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
    paddingVertical: 16,
    paddingTop: isWeb ? 26 : 50,
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
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#2D3436',
    outlineStyle: 'none' as any,
  },
  resultsList: {
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
    gap: 10,
    marginBottom: 12,
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
  courseLevel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  courseTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3436',
  },
  courseDetails: {
    gap: 6,
  },
  courseDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  courseDetailText: {
    fontSize: 13,
    color: '#666',
  },
  enrolledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  enrolledText: {
    color: '#27AE60',
    fontWeight: '600',
    fontSize: 14,
  },
  enrollButton: {
    backgroundColor: '#2C3E7A',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  enrollButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
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