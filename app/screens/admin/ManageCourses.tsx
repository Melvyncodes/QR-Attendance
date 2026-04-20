import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { collection, deleteDoc, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
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
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../../../firebase';

const isWeb = Dimensions.get('window').width > 768;

export default function AdminManageCourses() {
  const { userData } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isWeb } = useResponsive();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteProgress, setDeleteProgress] = useState('');

  const fetchCourses = async () => {
    try {
      const snap = await getDocs(collection(db, 'courses'));
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchCourses(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchCourses(); };

  const deleteCourseData = async (course: any) => {
    const courseId = course.id;

    setDeleteProgress('Deleting sessions...');
    const sessionsSnap = await getDocs(
      query(collection(db, 'sessions'), where('courseId', '==', courseId))
    );
    if (!sessionsSnap.empty) {
      const batch = writeBatch(db);
      sessionsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    setDeleteProgress('Deleting attendance records...');
    const attendanceSnap = await getDocs(
      query(collection(db, 'attendance'), where('courseId', '==', courseId))
    );
    if (!attendanceSnap.empty) {
      const batch = writeBatch(db);
      attendanceSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    setDeleteProgress('Deleting reports...');
    const reportsSnap = await getDocs(
      query(collection(db, 'reports'), where('courseId', '==', courseId))
    );
    if (!reportsSnap.empty) {
      const batch = writeBatch(db);
      reportsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    setDeleteProgress('Deleting notifications...');
    const notifSnap = await getDocs(
      query(collection(db, 'notifications'), where('courseId', '==', courseId))
    );
    if (!notifSnap.empty) {
      const batch = writeBatch(db);
      notifSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    setDeleteProgress('Deleting course...');
    await deleteDoc(doc(db, 'courses', courseId));
  };

  const handleDeleteCourse = (course: any) => {
    const summary = `This will permanently delete:\n• The course document\n• All sessions (${course.enrolledStudents?.length || 0} students enrolled)\n• All attendance records\n• All reports\n• Related notifications`;

    const doDelete = async () => {
      setDeleting(course.id);
      setDeleteProgress('Starting...');
      try {
        await deleteCourseData(course);
        setCourses(prev => prev.filter(c => c.id !== course.id));
        setDeleteProgress('');
        if (Platform.OS === 'web') {
          window.alert(`${course.courseCode} and all related data deleted successfully.`);
        } else {
          Alert.alert('Deleted', `${course.courseCode} and all related data deleted.`);
        }
      } catch (err) {
        console.error(err);
        if (Platform.OS === 'web') {
          window.alert('Error deleting course. Please try again.');
        } else {
          Alert.alert('Error', 'Failed to delete course. Please try again.');
        }
      } finally {
        setDeleting(null);
        setDeleteProgress('');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${course.courseCode} - ${course.courseTitle}?\n\n${summary}\n\nThis cannot be undone.`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Course',
        `Delete ${course.courseCode} - ${course.courseTitle}?\n\n${summary}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete All', style: 'destructive', onPress: doDelete }
        ]
      );
    }
  };

  const filtered = courses.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      (c.courseCode || '').toLowerCase().includes(q) ||
      (c.courseTitle || '').toLowerCase().includes(q) ||
      (c.lecturerName || '').toLowerCase().includes(q) ||
      (c.department || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#2C3E7A" /></View>;
  }

  return (
    <View style={styles.container}>
      {(isWeb || sidebarOpen) && (
        <Sidebar
          role="admin"
          userName={userData ? `${userData.firstName} ${userData.lastName}` : 'Admin'}
          activeRoute="/screens/admin/ManageCourses"
        />
      )}

      <View style={styles.content}>
        <View style={styles.topBar}>
          {!isWeb && (
            <TouchableOpacity style={styles.menuButton} onPress={() => setSidebarOpen(!sidebarOpen)}>
              <Ionicons name={sidebarOpen ? 'close' : 'menu'} size={24} color="#2C3E7A" />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Manage Courses</Text>
        </View>

        {/* Delete progress banner */}
        {deleting && deleteProgress !== '' && (
          <View style={styles.progressBanner}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.progressText}>{deleteProgress}</Text>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by code, title, lecturer..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#999" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.infoBar}>
          <Text style={styles.infoText}>{filtered.length} course{filtered.length !== 1 ? 's' : ''}</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2C3E7A']} tintColor="#2C3E7A" />}
        >
          <View style={styles.list}>
            {filtered.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={48} color="#D0D0D0" />
                <Text style={styles.emptyTitle}>No courses found</Text>
              </View>
            ) : (
              filtered.map((course) => (
                <View key={course.id} style={styles.courseCard}>
                  <View style={styles.courseHeader}>
                    <View style={styles.courseCodeBadge}>
                      <Text style={styles.courseCodeText}>{course.courseCode}</Text>
                    </View>
                    <View style={styles.courseHeaderRight}>
                      <Text style={styles.courseLevel}>{course.level} Level</Text>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteCourse(course)}
                        disabled={!!deleting}
                      >
                        {deleting === course.id
                          ? <ActivityIndicator size="small" color="#E74C3C" />
                          : <Ionicons name="trash-outline" size={16} color="#E74C3C" />
                        }
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={styles.courseTitle}>{course.courseTitle}</Text>

                  <View style={styles.courseDetails}>
                    <View style={styles.courseDetailItem}>
                      <Ionicons name="person-outline" size={13} color="#666" />
                      <Text style={styles.courseDetailText}>{course.lecturerName}</Text>
                    </View>
                    <View style={styles.courseDetailItem}>
                      <Ionicons name="business-outline" size={13} color="#666" />
                      <Text style={styles.courseDetailText}>{course.department}</Text>
                    </View>
                    <View style={styles.courseDetailItem}>
                      <Ionicons name="people-outline" size={13} color="#666" />
                      <Text style={styles.courseDetailText}>
                        {course.enrolledStudents?.length || 0} students enrolled
                      </Text>
                    </View>
                    <View style={styles.courseDetailItem}>
                      <Ionicons name="calendar-outline" size={13} color="#666" />
                      <Text style={styles.courseDetailText}>
                        {course.semester} Semester | {course.session}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
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
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 16, paddingTop: isWeb ? 22 : 50, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 12, minHeight: isWeb ? 69 : 80 },
  menuButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: isWeb ? 18 : 15, fontWeight: 'bold', color: '#2C3E7A', flex: 1 },
  progressBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2C3E7A', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  progressText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  searchContainer: { padding: 16, paddingBottom: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#E0E0E0', gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#2D3436', outlineStyle: 'none' as any },
  infoBar: { backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginBottom: 4 },
  infoText: { fontSize: 13, color: '#666' },
  list: { padding: 16, gap: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: '#2C3E7A' },
  courseCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: '#2C3E7A', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 10, marginBottom: 8 },
  courseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  courseCodeBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  courseCodeText: { color: '#2C3E7A', fontWeight: '700', fontSize: 13 },
  courseHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  courseLevel: { fontSize: 12, color: '#666', fontWeight: '600' },
  deleteBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#FDEDEC', justifyContent: 'center', alignItems: 'center' },
  courseTitle: { fontSize: 15, fontWeight: '700', color: '#2D3436' },
  courseDetails: { gap: 5 },
  courseDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  courseDetailText: { fontSize: 12, color: '#666' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
});
