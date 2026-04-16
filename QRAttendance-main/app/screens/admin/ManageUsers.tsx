import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { arrayRemove, collection, deleteDoc, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
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

export default function AdminManageUsers() {
  const { userData } = useUser();
  const { isWeb } = useResponsive();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<'students' | 'lecturers'>('students');
  const [students, setStudents] = useState<any[]>([]);
  const [lecturers, setLecturers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteProgress, setDeleteProgress] = useState('');

  const fetchUsers = async () => {
    try {
      const [studentsSnap, lecturersSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('role', '==', 'student'))),
        getDocs(query(collection(db, 'users'), where('role', '==', 'lecturer'))),
      ]);
      setStudents(studentsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLecturers(lecturersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchUsers(); };

  const deleteStudentData = async (user: any) => {
    setDeleteProgress('Removing from enrolled courses...');
    // Remove from all courses enrolledStudents array
    const coursesSnap = await getDocs(
      query(collection(db, 'courses'), where('enrolledStudents', 'array-contains', user.id))
    );
    await Promise.all(
      coursesSnap.docs.map(d =>
        updateDoc(doc(db, 'courses', d.id), { enrolledStudents: arrayRemove(user.id) })
      )
    );

    setDeleteProgress('Deleting attendance records...');
    const attendanceSnap = await getDocs(
      query(collection(db, 'attendance'), where('studentId', '==', user.id))
    );
    if (!attendanceSnap.empty) {
      const batch = writeBatch(db);
      attendanceSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    setDeleteProgress('Deleting notifications...');
    const notifSnap = await getDocs(
      query(collection(db, 'notifications'), where('userId', '==', user.id))
    );
    if (!notifSnap.empty) {
      const batch = writeBatch(db);
      notifSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    setDeleteProgress('Deleting user profile...');
    await deleteDoc(doc(db, 'users', user.id));
  };

  const deleteLecturerData = async (user: any) => {
    setDeleteProgress('Fetching lecturer courses...');
    const coursesSnap = await getDocs(
      query(collection(db, 'courses'), where('lecturerId', '==', user.id))
    );
    const courseIds = coursesSnap.docs.map(d => d.id);

    for (const courseId of courseIds) {
      setDeleteProgress(`Deleting sessions for course...`);
      const sessionsSnap = await getDocs(
        query(collection(db, 'sessions'), where('courseId', '==', courseId))
      );
      if (!sessionsSnap.empty) {
        const batch = writeBatch(db);
        sessionsSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      setDeleteProgress(`Deleting attendance records...`);
      const attendanceSnap = await getDocs(
        query(collection(db, 'attendance'), where('courseId', '==', courseId))
      );
      if (!attendanceSnap.empty) {
        const batch = writeBatch(db);
        attendanceSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      setDeleteProgress(`Deleting reports...`);
      const reportsSnap = await getDocs(
        query(collection(db, 'reports'), where('courseId', '==', courseId))
      );
      if (!reportsSnap.empty) {
        const batch = writeBatch(db);
        reportsSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      setDeleteProgress(`Deleting course...`);
      await deleteDoc(doc(db, 'courses', courseId));
    }

    setDeleteProgress('Deleting notifications...');
    const notifSnap = await getDocs(
      query(collection(db, 'notifications'), where('userId', '==', user.id))
    );
    if (!notifSnap.empty) {
      const batch = writeBatch(db);
      notifSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    setDeleteProgress('Deleting user profile...');
    await deleteDoc(doc(db, 'users', user.id));
  };

  const handleDeleteUser = (user: any) => {
    const isStudent = tab === 'students';
    const summary = isStudent
      ? `This will permanently delete:\n• Profile\n• Attendance records\n• Removed from all enrolled courses\n• Notifications`
      : `This will permanently delete:\n• Profile\n• All courses created by this lecturer\n• All sessions & attendance records\n• All reports\n• Notifications`;

    const doDelete = async () => {
      setDeleting(user.id);
      setDeleteProgress('Starting...');
      try {
        if (isStudent) {
          await deleteStudentData(user);
          setStudents(prev => prev.filter(s => s.id !== user.id));
        } else {
          await deleteLecturerData(user);
          setLecturers(prev => prev.filter(l => l.id !== user.id));
        }
        setDeleteProgress('');
        if (Platform.OS === 'web') {
          window.alert(`${user.firstName} ${user.lastName} and all related data deleted successfully.`);
        } else {
          Alert.alert('Deleted', `${user.firstName} ${user.lastName} and all related data deleted.`);
        }
      } catch (err) {
        console.error(err);
        setDeleteProgress('');
        if (Platform.OS === 'web') {
          window.alert('Error deleting user. Please try again.');
        } else {
          Alert.alert('Error', 'Failed to delete user. Please try again.');
        }
      } finally {
        setDeleting(null);
        setDeleteProgress('');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${user.firstName} ${user.lastName}?\n\n${summary}\n\nThis cannot be undone.`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete User',
        `Delete ${user.firstName} ${user.lastName}?\n\n${summary}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete All', style: 'destructive', onPress: doDelete }
        ]
      );
    }
  };

  const currentList = tab === 'students' ? students : lecturers;
  const filtered = currentList.filter(u => {
    const q = searchQuery.toLowerCase();
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      (u.matricNumber || u.staffId || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q)
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
          activeRoute="/screens/admin/ManageUsers"
        />
      )}

      <View style={styles.content}>
        <View style={styles.topBar}>
          {!isWeb && (
            <TouchableOpacity style={styles.menuButton} onPress={() => setSidebarOpen(!sidebarOpen)}>
              <Ionicons name={sidebarOpen ? 'close' : 'menu'} size={24} color="#2C3E7A" />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Manage Users</Text>
        </View>

        {/* Delete progress overlay */}
        {deleting && deleteProgress !== '' && (
          <View style={styles.progressBanner}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.progressText}>{deleteProgress}</Text>
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'students' && styles.tabActive]}
            onPress={() => { setTab('students'); setSearchQuery(''); }}
          >
            <Text style={[styles.tabText, tab === 'students' && styles.tabTextActive]}>
              Students ({students.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'lecturers' && styles.tabActive]}
            onPress={() => { setTab('lecturers'); setSearchQuery(''); }}
          >
            <Text style={[styles.tabText, tab === 'lecturers' && styles.tabTextActive]}>
              Lecturers ({lecturers.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder={`Search ${tab}...`}
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

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2C3E7A']} tintColor="#2C3E7A" />}
        >
          <View style={styles.list}>
            {filtered.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#D0D0D0" />
                <Text style={styles.emptyTitle}>No {tab} found</Text>
              </View>
            ) : (
              filtered.map((user) => (
                <View key={user.id} style={styles.userCard}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>
                      {(user.firstName?.[0] || '?').toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>
                      {tab === 'lecturers' ? `${user.title || ''} ` : ''}{user.firstName} {user.lastName}
                    </Text>
                    <Text style={styles.userSub}>
                      {tab === 'students' ? user.matricNumber : user.staffId}
                    </Text>
                    <Text style={styles.userSub}>{user.department}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteUser(user)}
                    disabled={!!deleting}
                  >
                    {deleting === user.id
                      ? <ActivityIndicator size="small" color="#E74C3C" />
                      : <Ionicons name="trash-outline" size={18} color="#E74C3C" />
                    }
                  </TouchableOpacity>
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
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#2C3E7A' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#999' },
  tabTextActive: { color: '#2C3E7A' },
  searchContainer: { padding: 16, paddingBottom: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#E0E0E0', gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#2D3436', outlineStyle: 'none' as any },
  list: { padding: 16, gap: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: '#2C3E7A' },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, marginBottom: 8 },
  userAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2C3E7A', justifyContent: 'center', alignItems: 'center' },
  userAvatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 14, fontWeight: '700', color: '#2D3436' },
  userSub: { fontSize: 12, color: '#666' },
  userEmail: { fontSize: 11, color: '#999' },
  deleteBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#FDEDEC', justifyContent: 'center', alignItems: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
});
