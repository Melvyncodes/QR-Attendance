import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../../../firebase';

const screenWidth = Dimensions.get('window').width;

const gridItems = [
  { label: 'My Courses', icon: 'book-outline', color: '#2C3E7A', route: '/screens/student/MyCourses' },
  { label: 'My Attendance', icon: 'checkmark-circle-outline', color: '#2C3E7A', route: '/screens/student/MyAttendance' },
  { label: 'Scan QR Code', icon: 'qr-code-outline', color: '#2C3E7A', route: '/screens/student/ScanQR' },
  { label: 'Notifications', icon: 'notifications-outline', color: '#2C3E7A', route: '/screens/student/Notifications' },
  { label: 'Profile', icon: 'person-outline', color: '#2C3E7A', route: '/screens/student/Profile' },
];

export default function StudentDashboard() {
  const { isWeb } = useResponsive();
  const { userData: studentData, userLoading: loading } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Real-time unread notification count
  useEffect(() => {
    if (!studentData?.uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', studentData.uid),
      where('read', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setUnreadCount(snap.size);
    });
    return () => unsubscribe();
  }, [studentData?.uid]);

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
          role="student"
          userName={studentData ? `${studentData.firstName} ${studentData.lastName}` : '...'}
          activeRoute="/screens/student/Dashboard"
        />
      )}

      <View style={styles.content}>
        <View style={[styles.topBar, { paddingTop: isWeb ? 29 : 50 }]}>
          {!isWeb && !sidebarOpen && (
            <TouchableOpacity style={styles.menuButton} onPress={() => setSidebarOpen(true)}>
              <Ionicons name="menu" size={24} color="#2C3E7A" />
            </TouchableOpacity>
          )}
          <Text style={[styles.headerTitle, { fontSize: isWeb ? 18 : 15 }]}>
            Dashboard | Current Session: 2025/2026
          </Text>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={() => router.push('/screens/student/Notifications' as any)}>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.infoBar}>
            <Text style={styles.infoText}>
              {[studentData?.matricNumber, studentData?.department, studentData?.college].filter(Boolean).join(' | ')}
            </Text>
          </View>

          <View style={styles.grid}>
            {gridItems.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={[styles.gridItem, { borderLeftColor: item.color }]}
                onPress={() => router.push(item.route as any)}
              >
                <Text style={[styles.gridLabel, { color: item.color }]}>
                  {item.label.toUpperCase()}
                </Text>
                <View style={styles.gridRight}>
                  {item.label === 'Notifications' && unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                    </View>
                  )}
                  <Ionicons name={item.icon as any} size={28} color="#D0D0D0" />
                </View>
              </TouchableOpacity>
            ))}
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
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 12, minHeight: 64 },
  menuButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontWeight: 'bold', color: '#2C3E7A', flex: 1 },
  infoBar: { backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginBottom: 4 },
  infoText: { fontSize: 13, color: '#666' },
  grid: { padding: 16, gap: 12 },
  gridItem: { backgroundColor: '#fff', borderRadius: 8, padding: 24, borderLeftWidth: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  gridLabel: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  gridRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { backgroundColor: '#E74C3C', borderRadius: 11, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
});
