import { useUser } from '@/context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../firebase';

const isWeb = Dimensions.get('window').width > 768;

interface SidebarProps {
  role: 'student' | 'lecturer' | 'admin';
  userName: string;
  activeRoute: string;
}

type NavItem = {
  label: string;
  icon: string;
  route: string;
  isNotifications?: boolean;
};

const studentNavItems: NavItem[] = [
  { label: 'Dashboard', icon: 'home-outline', route: '/screens/student/Dashboard' },
  { label: 'My Courses', icon: 'book-outline', route: '/screens/student/MyCourses' },
  { label: 'Scan QR', icon: 'qr-code-outline', route: '/screens/student/ScanQR' },
  { label: 'My Attendance', icon: 'checkmark-circle-outline', route: '/screens/student/MyAttendance' },
  { label: 'Notifications', icon: 'notifications-outline', route: '/screens/student/Notifications', isNotifications: true },
  { label: 'Profile', icon: 'person-outline', route: '/screens/student/Profile' },
];

const lecturerNavItems: NavItem[] = [
  { label: 'Dashboard', icon: 'home-outline', route: '/screens/lecturer/Dashboard' },
  { label: 'My Courses', icon: 'book-outline', route: '/screens/lecturer/MyCourses' },
  { label: 'Attendance', icon: 'people-outline', route: '/screens/lecturer/Attendance' },
  { label: 'Reports', icon: 'bar-chart-outline', route: '/screens/lecturer/Reports' },
  { label: 'Notifications', icon: 'notifications-outline', route: '/screens/lecturer/Notifications', isNotifications: true },
  { label: 'Profile', icon: 'person-outline', route: '/screens/lecturer/Profile' },
];

const adminNavItems: NavItem[] = [
  { label: 'Dashboard', icon: 'grid-outline', route: '/screens/admin/Dashboard' },
  { label: 'Manage Users', icon: 'people-outline', route: '/screens/admin/ManageUsers' },
  { label: 'Manage Courses', icon: 'book-outline', route: '/screens/admin/ManageCourses' },
  { label: 'Notifications', icon: 'notifications-outline', route: '/screens/admin/Notifications', isNotifications: true },
  { label: 'NFC Enrollment', icon: 'card-outline', route: '/screens/admin/NFC' },
  { label: 'Reports', icon: 'bar-chart-outline', route: '/screens/admin/Reports' },
  { label: 'Profile', icon: 'person-outline', route: '/screens/admin/Profile' },
];

export default function Sidebar({ role, userName, activeRoute }: SidebarProps) {
  const { userData } = useUser();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const uid = role === 'admin' ? 'admin' : userData?.uid;
    if (!uid) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', uid),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (role === 'admin') {
        const pending = snap.docs.filter(d => d.data().status === 'pending');
        setUnreadCount(pending.length);
      } else {
        setUnreadCount(snap.docs.length);
      }
    });

    return () => unsubscribe();
  }, [userData?.uid, role]);

  const navItems = role === 'student'
    ? studentNavItems
    : role === 'lecturer'
      ? lecturerNavItems
      : adminNavItems;

  const performLogout = async () => {
    setLoggingOut(true);
    try {
      await new Promise<void>((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          if (!user) {
            unsubscribe();
            resolve();
          }
        });
        signOut(auth).catch(reject);
      });
      router.replace('/screens/auth/LoginScreen' as any);
    } catch (err) {
      console.error('Logout error:', err);
      setLoggingOut(false);
    }
  };

  const handleLogout = () => {
    if (loggingOut) return;
    if (Platform.OS === 'web') {
      performLogout();
    } else {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: performLogout }
      ]);
    }
  };

  const avatarLetter = userName?.[0]?.toUpperCase() || '?';
  const hasPhoto = !!userData?.profilePhoto;

  return (
    <View style={styles.sidebar}>
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require('../assets/images/logo-sidebar.png')}
          style={{ width: 160, height: 40, resizeMode: 'contain' }}
        />
      </View>

      {/* Divider between logo and user — full width to align with topBar */}
      <View style={styles.fullDivider} />

      {/* User Info */}
      <View style={styles.userInfo}>
        {hasPhoto ? (
          <Image source={{ uri: userData.profilePhoto }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
        )}
        <View style={styles.userDetails}>
          <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
          <Text style={styles.userRole}>{role.charAt(0).toUpperCase() + role.slice(1)}</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Nav Items */}
      <View style={styles.nav}>
        {navItems.map((item) => {
          const isActive = activeRoute === item.route || activeRoute.includes(item.route.split('/').pop() || '');
          const showBadge = item.isNotifications && unreadCount > 0;

          return (
            <TouchableOpacity
              key={item.route}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => router.push(item.route as any)}
            >
              <View style={styles.navItemLeft}>
                <Ionicons
                  name={item.icon as any}
                  size={20}
                  color={isActive ? '#fff' : 'rgba(255,255,255,0.65)'}
                />
                <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                  {item.label}
                </Text>
              </View>
              {showBadge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Logout */}
      <View style={styles.footer}>
        <View style={styles.divider} />
        <TouchableOpacity
          style={[styles.logoutButton, loggingOut && { opacity: 0.5 }]}
          onPress={handleLogout}
          disabled={loggingOut}
        >
          <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.65)" />
          <Text style={styles.logoutText}>{loggingOut ? 'Logging out...' : 'Logout'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 220,
    backgroundColor: '#2C3E7A',
    height: '100%',
    position: isWeb ? 'relative' as any : 'absolute' as any,
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 30,
    flexShrink: 0,
  },
  header: { paddingHorizontal: 16, paddingTop: isWeb ? 14 : 50, paddingBottom: 14, minHeight: isWeb ? 64: 100, justifyContent: 'center' },
  fullDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  logoText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  userInfo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarImage: { width: 36, height: 36, borderRadius: 18, flexShrink: 0 },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  userDetails: { flex: 1, minWidth: 0 },
  userName: { color: '#fff', fontWeight: '600', fontSize: 13 },
  userRole: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16, marginBottom: 8 },
  nav: { flex: 1, paddingHorizontal: 10, paddingTop: 4, gap: 2 },
  navItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, gap: 10 },
  navItemActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
  navItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  navLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontWeight: '500' },
  navLabelActive: { color: '#fff', fontWeight: '700' },
  badge: { backgroundColor: '#E74C3C', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  footer: { paddingBottom: 20 },
  logoutButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 22, gap: 10, marginTop: 4 },
  logoutText: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontWeight: '500' },
});
