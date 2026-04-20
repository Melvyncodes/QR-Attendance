import Sidebar from '@/components/Sidebar';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { auth, db } from '../../../firebase';

const gridItems = [
  { label: 'Cleanup Orphaned Sessions', icon: 'trash-outline', color: '#2C3E7A', route: '/screens/admin/CleanupOrphanedSessions' },
  { label: 'Manage Users', icon: 'people-outline', color: '#2C3E7A', route: '/screens/admin/ManageUsers' },
  { label: 'Manage Courses', icon: 'book-outline', color: '#2C3E7A', route: '/screens/admin/ManageCourses' },
  { label: 'Notifications', icon: 'notifications-outline', color: '#2C3E7A', route: '/screens/admin/Notifications' },
  { label: 'NFC Enrollment', icon: 'card-outline', color: '#2C3E7A', route: '/screens/admin/NFC' },
  { label: 'Reports', icon: 'bar-chart-outline', color: '#2C3E7A', route: '/screens/admin/Reports' },
  { label: 'Profile', icon: 'person-outline', color: '#2C3E7A', route: '/screens/admin/Profile' },
];

export default function AdminDashboard() {
  const { isWeb, width } = useResponsive();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isNarrow = width < 800;
  const [adminData, setAdminData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalStudents: 0, totalLecturers: 0, totalCourses: 0, activeSessions: 0, pendingRequests: 0,
  });
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) setAdminData(docSnap.data());
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [studentsSnap, lecturersSnap, coursesSnap, sessionsSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('role', '==', 'student'))),
          getDocs(query(collection(db, 'users'), where('role', '==', 'lecturer'))),
          getDocs(collection(db, 'courses')),
          getDocs(query(collection(db, 'sessions'), where('status', '==', 'active'))),
        ]);
        const notifSnap = await getDocs(query(
          collection(db, 'notifications'), where('userId', '==', 'admin'), where('status', '==', 'pending')
        ));
        setStats({
          totalStudents: studentsSnap.size, totalLecturers: lecturersSnap.size,
          totalCourses: coursesSnap.size, activeSessions: sessionsSnap.size, pendingRequests: notifSnap.size,
        });
      } catch (err) { console.error(err); }
    };
    fetchStats();
  }, []);

  // Real-time pending requests + unread count
  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', 'admin'),
      where('read', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const pending = snap.docs.filter(d => d.data().status === 'pending');
      setStats(prev => ({ ...prev, pendingRequests: pending.length }));
      setUnreadCount(snap.size);
    });
    return unsubscribe;
  }, []);

  const onRefresh = () => { setRefreshing(true); setTimeout(() => setRefreshing(false), 1000); };

  if (loading) {
    return <View style={s.loadingContainer}><ActivityIndicator size="large" color="#2C3E7A" /></View>;
  }

  return (
    <View style={s.container}>
      {(isWeb || sidebarOpen) && (
        <Sidebar role="admin" userName={`${adminData?.firstName || 'Admin'} ${adminData?.lastName || ''}`} activeRoute="/screens/admin/Dashboard" />
      )}
      <View style={s.content}>
        <View style={[s.topBar, { paddingTop: isWeb ? 14 : 50 }]}>
          {!isWeb && !sidebarOpen && (
            <TouchableOpacity style={s.menuButton} onPress={() => setSidebarOpen(true)}>
              <Ionicons name="menu" size={24} color="#2C3E7A" />
            </TouchableOpacity>
          )}
          <Text style={[s.headerTitle, { fontSize: isWeb ? 18 : 15 }]}>Admin Dashboard | 2025/2026</Text>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={() => router.push('/screens/admin/Notifications' as any)}>
              {/* <View style={s.topBadge}>
                <Text style={s.topBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View> */}
            </TouchableOpacity>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2C3E7A']} tintColor="#2C3E7A" />}>
          <View style={s.infoBar}><Text style={s.infoText}>{adminData?.email} | Administrator</Text></View>

          {isNarrow ? (
            /* Narrow: bold list layout */
            <View style={s.statsList}>
              <View style={s.statListRow}>
                <Ionicons name="people-outline" size={20} color="#2C3E7A" />
                <Text style={s.statListLabel}>Students</Text>
                <Text style={s.statListNumber}>{stats.totalStudents}</Text>
              </View>
              <View style={s.statListRow}>
                <Ionicons name="school-outline" size={20} color="#2C3E7A" />
                <Text style={s.statListLabel}>Lecturers</Text>
                <Text style={s.statListNumber}>{stats.totalLecturers}</Text>
              </View>
              <View style={s.statListRow}>
                <Ionicons name="book-outline" size={20} color="#2C3E7A" />
                <Text style={s.statListLabel}>Courses</Text>
                <Text style={s.statListNumber}>{stats.totalCourses}</Text>
              </View>
              <View style={[s.statListRow, stats.activeSessions > 0 && s.statListRowActive]}>
                <Ionicons name="radio-outline" size={20} color={stats.activeSessions > 0 ? '#fff' : '#2C3E7A'} />
                <Text style={[s.statListLabel, stats.activeSessions > 0 && { color: '#fff' }]}>Live Sessions</Text>
                <Text style={[s.statListNumber, stats.activeSessions > 0 && { color: '#fff' }]}>{stats.activeSessions}</Text>
              </View>
            </View>
          ) : (
            /* Wide: 2x2 grid layout */
            <View style={s.statsGrid}>
              <View style={s.statCard}>
                <Ionicons name="people-outline" size={22} color="#2C3E7A" />
                <Text style={s.statNumber}>{stats.totalStudents}</Text><Text style={s.statLabel}>Students</Text>
              </View>
              <View style={s.statCard}>
                <Ionicons name="school-outline" size={22} color="#2C3E7A" />
                <Text style={s.statNumber}>{stats.totalLecturers}</Text><Text style={s.statLabel}>Lecturers</Text>
              </View>
              <View style={s.statCard}>
                <Ionicons name="book-outline" size={22} color="#2C3E7A" />
                <Text style={s.statNumber}>{stats.totalCourses}</Text><Text style={s.statLabel}>Courses</Text>
              </View>
              <View style={[s.statCard, stats.activeSessions > 0 && s.statCardActive]}>
                <Ionicons name="radio-outline" size={22} color={stats.activeSessions > 0 ? '#fff' : '#2C3E7A'} />
                <Text style={[s.statNumber, stats.activeSessions > 0 && { color: '#fff' }]}>{stats.activeSessions}</Text>
                <Text style={[s.statLabel, stats.activeSessions > 0 && { color: '#fff' }]}>Live Sessions</Text>
              </View>
            </View>
          )}

          {stats.pendingRequests > 0 && (
            <TouchableOpacity style={s.pendingAlert} onPress={() => router.push('/screens/admin/Notifications' as any)}>
              <View style={s.pendingAlertLeft}>
                <Ionicons name="alert-circle-outline" size={20} color="#E74C3C" />
                <Text style={s.pendingAlertText}>{stats.pendingRequests} pending request{stats.pendingRequests > 1 ? 's' : ''} need your attention</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#E74C3C" />
            </TouchableOpacity>
          )}

          <View style={s.grid}>
            {gridItems.map((item) => (
              <TouchableOpacity key={item.label} style={[s.gridItem, { borderLeftColor: item.color }]}
                onPress={() => { if (!isWeb) setSidebarOpen(false); router.push(item.route as any); }}>
                <Text style={[s.gridLabel, { color: item.color }]}>{item.label.toUpperCase()}</Text>
                <View style={s.gridRight}>
                  {item.label === 'Notifications' && unreadCount > 0 && (
                    <View style={s.badge}><Text style={s.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View>
                  )}
                  <Ionicons name={item.icon as any} size={28} color="#D0D0D0" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
      {sidebarOpen && !isWeb && <TouchableOpacity style={s.overlay} onPress={() => setSidebarOpen(false)} />}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#F5F6FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F6FA' },
  content: { flex: 1, overflow: 'hidden', minWidth: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 12, minHeight: 69 },
  menuButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontWeight: 'bold', color: '#2C3E7A', flex: 1 },
  // topBadge: { backgroundColor: '#E74C3C', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  // topBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  infoBar: { backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginBottom: 4 },
  infoText: { fontSize: 13, color: '#666' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 12 },
  statsList: { padding: 16, gap: 8 },
  statListRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  statListRowActive: { backgroundColor: '#2C3E7A' },
  statListLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: '#2C3E7A' },
  statListNumber: { fontSize: 22, fontWeight: 'bold', color: '#2C3E7A' },
  statCard: { flex: 1, minWidth: '45%' as any, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  statCardActive: { backgroundColor: '#2C3E7A' },
  statNumber: { fontSize: 26, fontWeight: 'bold', color: '#2C3E7A' },
  statLabel: { fontSize: 12, color: '#666', textAlign: 'center' },
  pendingAlert: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FDEDEC', marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E74C3C' },
  pendingAlertLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  pendingAlertText: { fontSize: 13, fontWeight: '600', color: '#E74C3C', flex: 1 },
  grid: { padding: 16, gap: 12 },
  gridItem: { backgroundColor: '#fff', borderRadius: 8, padding: 24, borderLeftWidth: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  gridLabel: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  gridRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { backgroundColor: '#E74C3C', borderRadius: 11, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
});
