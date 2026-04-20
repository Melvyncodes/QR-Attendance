import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
 import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
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

export default function LecturerAttendance() {
  const { isWeb } = useResponsive();
  const { userData } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchActiveSessions = async () => {
    if (!userData?.uid) return;
    try {
      const sessionsRef = collection(db, 'sessions');
      const q = query(
        sessionsRef,
        where('lecturerId', '==', userData.uid),
        where('status', '==', 'active')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveSessions(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingActive(false);
      setRefreshing(false);
    }
  };

  // Real-time listener for active sessions
  useEffect(() => {
    if (!userData?.uid) return;
    const sessionsRef = collection(db, 'sessions');
    const q = query(
      sessionsRef,
      where('lecturerId', '==', userData.uid),
      where('status', '==', 'active')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveSessions(list);
      setLoadingActive(false);
    });
    return unsubscribe;
  }, [userData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchActiveSessions();
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return 'N/A';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={styles.container}>
      {(isWeb || sidebarOpen) && (
        <Sidebar
          role="lecturer"
          userName={userData ? `${userData.title || ''} ${userData.firstName} ${userData.lastName}`.trim() : '...'}
          activeRoute="/screens/lecturer/Attendance"
        />
      )}

      <View style={styles.content}>
        <View style={styles.topBar}>
          {!isWeb && (
            <TouchableOpacity style={styles.menuButton} onPress={() => setSidebarOpen(!sidebarOpen)}>
              <Ionicons name={sidebarOpen ? 'close' : 'menu'} size={24} color="#2C3E7A" />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Attendance</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2C3E7A']} tintColor="#2C3E7A" />
          }
        >
          {/* Active Sessions Section */}
          {loadingActive ? (
            <ActivityIndicator size="large" color="#2C3E7A" style={{ marginTop: 40 }} />
          ) : activeSessions.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.livePulse} />
                <Text style={styles.sectionTitle}>Active Sessions ({activeSessions.length})</Text>
              </View>

              {activeSessions.map((session) => (
                <TouchableOpacity
                  key={session.id}
                  style={styles.activeSessionCard}
                  onPress={() => router.push({
                    pathname: '/screens/lecturer/ActiveSession' as any,
                    params: {
                      courseId: session.courseId,
                      courseTitle: session.courseTitle,
                      courseCode: session.courseCode,
                      enrolledCount: session.totalEnrolled || 0,
                      existingSessionId: session.id,
                    }
                  })}
                >
                  <View style={styles.activeCardHeader}>
                    <View style={styles.courseCodeBadge}>
                      <Text style={styles.courseCodeText}>{session.courseCode}</Text>
                    </View>
                    <View style={styles.liveBadge}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>LIVE</Text>
                    </View>
                  </View>

                  <Text style={styles.activeCardTitle}>{session.courseTitle}</Text>

                  <View style={styles.activeCardStats}>
                    <View style={styles.activeCardStat}>
                      <Ionicons name="people-outline" size={14} color="#666" />
                      <Text style={styles.activeCardStatText}>
                        {session.totalPresent || 0}/{session.totalEnrolled || 0} present
                      </Text>
                    </View>
                    <View style={styles.activeCardStat}>
                      <Ionicons name="time-outline" size={14} color="#666" />
                      <Text style={styles.activeCardStatText}>
                        Started {formatTime(session.createdAt)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.viewSessionButton}>
                    <Ionicons name="eye-outline" size={16} color="#fff" />
                    <Text style={styles.viewSessionText}>View Session</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            /* No active sessions — show take attendance */
            <View style={styles.center}>
              <Ionicons name="people-outline" size={64} color="#2C3E7A" />
              <Text style={styles.title}>Attendance Management</Text>
              <Text style={styles.subtitle}>No active sessions right now</Text>
              <TouchableOpacity
                style={styles.button}
                onPress={() => router.push('/screens/lecturer/AttendanceSession' as any)}
              >
                <Ionicons name="play-circle-outline" size={20} color="#fff" />
                <Text style={styles.buttonText}>Take Attendance</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Take Attendance button always visible at bottom when sessions exist */}
          {activeSessions.length > 0 && (
            <View style={styles.bottomAction}>
              <TouchableOpacity
                style={styles.newSessionButton}
                onPress={() => router.push('/screens/lecturer/AttendanceSession' as any)}
              >
                <Ionicons name="add-circle-outline" size={18} color="#2C3E7A" />
                <Text style={styles.newSessionText}>Start New Session</Text>
              </TouchableOpacity>
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
  content: { flex: 1, overflow: 'hidden', minWidth: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 22, paddingTop: isWeb ? 22 : 50, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 12, minHeight: isWeb ? 64 : 80 },
  menuButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: isWeb ? 18 : 15, fontWeight: 'bold', color: '#2C3E7A', flex: 1 },
  section: { padding: 16, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  livePulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#27AE60' },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#2C3E7A' },
  activeSessionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#27AE60',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
    marginBottom: 12,
  },
  activeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  courseCodeBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  courseCodeText: { color: '#2C3E7A', fontWeight: '700', fontSize: 13 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAFAF1', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#27AE60' },
  liveText: { fontSize: 11, fontWeight: '700', color: '#27AE60' },
  activeCardTitle: { fontSize: 16, fontWeight: '700', color: '#2D3436' },
  activeCardStats: { gap: 6 },
  activeCardStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeCardStatText: { fontSize: 13, color: '#666' },
  viewSessionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#27AE60', padding: 12, borderRadius: 8, gap: 6 },
  viewSessionText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24, marginTop: 60 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2C3E7A' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center' },
  button: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2C3E7A', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, gap: 8, marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  bottomAction: { padding: 16, paddingTop: 0 },
  newSessionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2C3E7A', padding: 12, borderRadius: 8, gap: 6 },
  newSessionText: { color: '#2C3E7A', fontWeight: '600', fontSize: 14 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
});
