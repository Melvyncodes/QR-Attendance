import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import {
  addDoc,
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { db } from '../../../firebase';

const getNotifIcon = (type: string) => {
  switch (type) {
    case 'delete_course_request': return { name: 'trash-outline', color: '#E74C3C' };
    case 'unenroll_request': return { name: 'person-remove-outline', color: '#F39C12' };
    case 'delete_report_request': return { name: 'document-text-outline', color: '#E74C3C' };
    case 'reset_course_reports_request': return { name: 'nuclear-outline', color: '#E74C3C' };
    default: return { name: 'notifications-outline', color: '#2C3E7A' };
  }
};

export default function AdminNotifications() {
  const { isWeb } = useResponsive();
  const { userData } = useUser();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  useEffect(() => {
    const q = query(collection(db, 'notifications'), where('userId', '==', 'admin'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime - aTime;
        });
      setNotifications(list);
      setLoading(false);
      setRefreshing(false);
    });
    return () => unsubscribe();
  }, []);

  const handleTap = async (notif: any) => {
    setExpandedId(prev => prev === notif.id ? null : notif.id);
    if (!notif.read) {
      try {
        await updateDoc(doc(db, 'notifications', notif.id), { read: true });
      } catch (err) { console.error(err); }
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    await Promise.all(
      unread.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true }))
    );
  };

  const deleteNotification = async (notifId: string) => {
    try {
      swipeableRefs.current.get(notifId)?.close();
      swipeableRefs.current.delete(notifId);
      await deleteDoc(doc(db, 'notifications', notifId));
    } catch (err) { console.error(err); }
  };

  const clearResolved = async () => {
    // For admin: keep pending requests, clear everything else
    const toDelete = notifications.filter(n => n.status !== 'pending');
    if (toDelete.length === 0) {
      if (Platform.OS === 'web') window.alert('No resolved notifications to clear.');
      else Alert.alert('Nothing to Clear', 'No resolved notifications to clear.');
      return;
    }
    const doClear = async () => {
      setClearing(true);
      try {
        const batch = writeBatch(db);
        toDelete.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
        await batch.commit();
      } catch (err) { console.error(err); }
      finally { setClearing(false); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Clear ${toDelete.length} resolved notification${toDelete.length !== 1 ? 's' : ''}? Pending requests will be kept.`)) doClear();
    } else {
      Alert.alert('Clear Notifications', `Clear ${toDelete.length} resolved notification${toDelete.length !== 1 ? 's' : ''}?\n\nPending requests will be kept.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: doClear },
      ]);
    }
  };

  const handleDeleteCourse = async (notif: any, approve: boolean) => {
    setProcessing(notif.id);
    try {
      if (approve) {
        const courseId = notif.courseId;
        const sessionsSnap = await getDocs(query(collection(db, 'sessions'), where('courseId', '==', courseId)));
        if (!sessionsSnap.empty) {
          const batch = writeBatch(db);
          sessionsSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        const attendanceSnap = await getDocs(query(collection(db, 'attendance'), where('courseId', '==', courseId)));
        if (!attendanceSnap.empty) {
          const batch = writeBatch(db);
          attendanceSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        const reportsSnap = await getDocs(query(collection(db, 'reports'), where('courseId', '==', courseId)));
        if (!reportsSnap.empty) {
          const batch = writeBatch(db);
          reportsSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        const notifSnap = await getDocs(query(collection(db, 'notifications'), where('courseId', '==', courseId)));
        if (!notifSnap.empty) {
          const batch = writeBatch(db);
          notifSnap.docs.forEach(d => { if (d.id !== notif.id) batch.delete(d.ref); });
          await batch.commit();
        }
        await deleteDoc(doc(db, 'courses', courseId));
        if (notif.requestedById) {
          await addDoc(collection(db, 'notifications'), {
            userId: notif.requestedById,
            type: 'delete_course_approved',
            message: `Your request to delete ${notif.courseCode} — ${notif.courseTitle} has been approved by admin.`,
            courseId: notif.courseId,
            courseTitle: notif.courseTitle,
            read: false,
            createdAt: serverTimestamp(),
          });
        }
      } else if (notif.requestedById) {
        await addDoc(collection(db, 'notifications'), {
          userId: notif.requestedById,
          type: 'delete_course_rejected',
          message: `Your request to delete ${notif.courseCode} — ${notif.courseTitle} has been rejected by admin.`,
          courseId: notif.courseId,
          courseTitle: notif.courseTitle,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, 'notifications', notif.id), {
        status: approve ? 'approved' : 'rejected',
        read: true,
        resolvedAt: serverTimestamp(),
      });
      setExpandedId(null);
    } catch (err) { console.error(err); }
    finally { setProcessing(null); }
  };

  const handleUnenroll = async (notif: any, approve: boolean) => {
    setProcessing(notif.id);
    try {
      if (approve && notif.courseId && notif.studentId) {
        await updateDoc(doc(db, 'courses', notif.courseId), {
          enrolledStudents: arrayRemove(notif.studentId),
        });
        await addDoc(collection(db, 'notifications'), {
          userId: notif.studentId,
          type: 'unenroll_approved',
          message: `Your request to unenroll from ${notif.courseTitle} has been approved by admin.`,
          courseId: notif.courseId,
          courseTitle: notif.courseTitle,
          read: false,
          createdAt: serverTimestamp(),
        });
      } else if (!approve && notif.studentId) {
        await addDoc(collection(db, 'notifications'), {
          userId: notif.studentId,
          type: 'unenroll_rejected',
          message: `Your request to unenroll from ${notif.courseTitle} has been rejected by admin.`,
          courseId: notif.courseId,
          courseTitle: notif.courseTitle,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, 'notifications', notif.id), {
        status: approve ? 'approved' : 'rejected',
        read: true,
        resolvedAt: serverTimestamp(),
      });
      setExpandedId(null);
    } catch (err) { console.error(err); }
    finally { setProcessing(null); }
  };

  const handleDeleteReport = async (notif: any, approve: boolean) => {
    setProcessing(notif.id);
    try {
      if (approve && notif.reportId) {
        await deleteDoc(doc(db, 'reports', notif.reportId));
        if (notif.sessionId) {
          const attSnap = await getDocs(query(collection(db, 'attendance'), where('sessionId', '==', notif.sessionId)));
          if (!attSnap.empty) {
            const batch = writeBatch(db);
            attSnap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
          await deleteDoc(doc(db, 'sessions', notif.sessionId)).catch(() => {});
        }
        if (notif.requestedById) {
          await addDoc(collection(db, 'notifications'), {
            userId: notif.requestedById,
            type: 'delete_report_approved',
            message: `Your request to delete the report for ${notif.courseCode} — ${notif.courseTitle} has been approved by admin.`,
            courseId: notif.courseId,
            courseTitle: notif.courseTitle,
            read: false,
            createdAt: serverTimestamp(),
          });
        }
      } else if (!approve && notif.requestedById) {
        await addDoc(collection(db, 'notifications'), {
          userId: notif.requestedById,
          type: 'delete_report_rejected',
          message: `Your request to delete the report for ${notif.courseCode} — ${notif.courseTitle} has been rejected by admin.`,
          courseId: notif.courseId,
          courseTitle: notif.courseTitle,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, 'notifications', notif.id), {
        status: approve ? 'approved' : 'rejected',
        read: true,
        resolvedAt: serverTimestamp(),
      });
      setExpandedId(null);
    } catch (err) { console.error(err); }
    finally { setProcessing(null); }
  };

  const handleResetCourseReports = async (notif: any, approve: boolean) => {
    setProcessing(notif.id);
    try {
      if (approve && notif.courseId) {
        const reportsSnap = await getDocs(query(collection(db, 'reports'), where('courseId', '==', notif.courseId)));
        if (!reportsSnap.empty) {
          const batch = writeBatch(db);
          reportsSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        const attSnap = await getDocs(query(collection(db, 'attendance'), where('courseId', '==', notif.courseId)));
        if (!attSnap.empty) {
          const batch = writeBatch(db);
          attSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        const sessionsSnap = await getDocs(query(collection(db, 'sessions'), where('courseId', '==', notif.courseId)));
        if (!sessionsSnap.empty) {
          const batch = writeBatch(db);
          sessionsSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        if (notif.requestedById) {
          await addDoc(collection(db, 'notifications'), {
            userId: notif.requestedById,
            type: 'reset_reports_approved',
            message: `Your request to reset all reports for ${notif.courseCode} — ${notif.courseTitle} has been approved. All reports, attendance records, and sessions have been deleted.`,
            courseId: notif.courseId,
            courseTitle: notif.courseTitle,
            read: false,
            createdAt: serverTimestamp(),
          });
        }
      } else if (!approve && notif.requestedById) {
        await addDoc(collection(db, 'notifications'), {
          userId: notif.requestedById,
          type: 'reset_reports_rejected',
          message: `Your request to reset all reports for ${notif.courseCode} — ${notif.courseTitle} has been rejected by admin.`,
          courseId: notif.courseId,
          courseTitle: notif.courseTitle,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, 'notifications', notif.id), {
        status: approve ? 'approved' : 'rejected',
        read: true,
        resolvedAt: serverTimestamp(),
      });
      setExpandedId(null);
    } catch (err) { console.error(err); }
    finally { setProcessing(null); }
  };

  const handleAction = (notif: any, approve: boolean) => {
    if (notif.type === 'delete_course_request') handleDeleteCourse(notif, approve);
    else if (notif.type === 'unenroll_request') handleUnenroll(notif, approve);
    else if (notif.type === 'delete_report_request') handleDeleteReport(notif, approve);
    else if (notif.type === 'reset_course_reports_request') handleResetCourseReports(notif, approve);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
    notifId: string
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity
        style={styles.swipeDeleteAction}
        onPress={() => deleteNotification(notifId)}
        activeOpacity={0.8}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center', gap: 4 }}>
          <Ionicons name="trash-outline" size={24} color="#fff" />
          <Text style={styles.swipeDeleteText}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const resolvedCount = notifications.filter(n => n.status && n.status !== 'pending').length;

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#2C3E7A" /></View>;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        {(isWeb || sidebarOpen) && (
          <Sidebar
            role="admin"
            userName={userData ? `${userData.firstName} ${userData.lastName}` : 'Admin'}
            activeRoute="/screens/admin/Notifications"
          />
        )}

        <View style={styles.content}>
          <View style={[styles.topBar, { paddingTop: isWeb ? 20 : 50, minHeight: isWeb ? 69 : 80 }]}>
            {!isWeb && !sidebarOpen && (
              <TouchableOpacity style={styles.menuButton} onPress={() => setSidebarOpen(true)}>
                <Ionicons name="menu" size={24} color="#2C3E7A" />
              </TouchableOpacity>
            )}
            <Text style={[styles.headerTitle, { fontSize: isWeb ? 18 : 15 }]}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
            {unreadCount > 0 && (
              <TouchableOpacity style={styles.markAllButton} onPress={markAllRead}>
                <Text style={styles.markAllText}>Mark all read</Text>
              </TouchableOpacity>
            )}
            {resolvedCount > 0 && (
              <TouchableOpacity style={styles.clearAllButton} onPress={clearResolved} disabled={clearing}>
                {clearing
                  ? <ActivityIndicator size="small" color="#E74C3C" />
                  : <Ionicons name="trash-outline" size={16} color="#E74C3C" />
                }
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} colors={['#2C3E7A']} tintColor="#2C3E7A" />}
          >
            {notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="notifications-outline" size={48} color="#D0D0D0" />
                <Text style={styles.emptyTitle}>No Notifications</Text>
                <Text style={styles.emptySubtitle}>
                  You'll be notified about pending requests and updates here
                </Text>
              </View>
            ) : (
              <View style={styles.notifList}>
                {notifications.map((notif) => {
                  const icon = getNotifIcon(notif.type);
                  const isExpanded = expandedId === notif.id;
                  const isPending = notif.status === 'pending';
                  const isActionable = isPending && (notif.type === 'delete_course_request' || notif.type === 'unenroll_request' || notif.type === 'delete_report_request' || notif.type === 'reset_course_reports_request');

                  return (
                    <Swipeable
                      key={notif.id}
                      ref={(ref) => {
                        if (ref) swipeableRefs.current.set(notif.id, ref);
                      }}
                      renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, notif.id)}
                      rightThreshold={40}
                      friction={2}
                      overshootRight={false}
                    >
                      <TouchableOpacity
                        style={[
                          styles.notifCard,
                          !notif.read && styles.notifCardUnread,
                          isActionable && styles.notifCardRequest,
                          isExpanded && styles.notifCardExpanded,
                        ]}
                        onPress={() => handleTap(notif)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.notifRow}>
                          <View style={[styles.iconContainer, { backgroundColor: icon.color + '20' }]}>
                            <Ionicons name={icon.name as any} size={22} color={icon.color} />
                          </View>
                          <View style={styles.notifBody}>
                            <Text style={styles.notifMessage}>{notif.message}</Text>
                            <Text style={styles.notifTime}>{formatDate(notif.createdAt)}</Text>
                          </View>
                          <View style={styles.notifRight}>
                            {!notif.read && <View style={styles.unreadDot} />}
                            {isActionable && (
                              <Ionicons
                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                size={16}
                                color={notif.type === 'unenroll_request' ? '#F39C12' : '#E74C3C'}
                              />
                            )}
                          </View>
                        </View>

                        {isExpanded && isActionable && (
                          <View style={styles.expandedSection}>
                            <View style={styles.expandedDivider} />
                            {notif.courseCode && (
                              <View style={styles.detailRow}>
                                <Ionicons name="book-outline" size={14} color="#666" />
                                <Text style={styles.detailText}>{notif.courseCode} — {notif.courseTitle}</Text>
                              </View>
                            )}
                            {notif.requestedBy && (
                              <View style={styles.detailRow}>
                                <Ionicons name="person-outline" size={14} color="#666" />
                                <Text style={styles.detailText}>Requested by: {notif.requestedBy}</Text>
                              </View>
                            )}
                            {notif.studentName && (
                              <View style={styles.detailRow}>
                                <Ionicons name="school-outline" size={14} color="#666" />
                                <Text style={styles.detailText}>
                                  {notif.studentName}{notif.matricNumber ? ` — ${notif.matricNumber}` : ''}
                                </Text>
                              </View>
                            )}
                            {processing === notif.id ? (
                              <ActivityIndicator size="small" color="#2C3E7A" style={{ marginTop: 8 }} />
                            ) : (
                              <View style={styles.actionButtons}>
                                <TouchableOpacity style={styles.rejectBtn} onPress={() => handleAction(notif, false)}>
                                  <Ionicons name="close-circle-outline" size={16} color="#E74C3C" />
                                  <Text style={styles.rejectBtnText}>Reject</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.approveBtn} onPress={() => handleAction(notif, true)}>
                                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                                  <Text style={styles.approveBtnText}>Approve</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        )}

                        {isExpanded && !isPending && (notif.type === 'delete_course_request' || notif.type === 'unenroll_request' || notif.type === 'delete_report_request' || notif.type === 'reset_course_reports_request') && (
                          <View style={styles.expandedSection}>
                            <View style={styles.expandedDivider} />
                            {notif.courseCode && (
                              <View style={styles.detailRow}>
                                <Ionicons name="book-outline" size={14} color="#666" />
                                <Text style={styles.detailText}>{notif.courseCode} — {notif.courseTitle}</Text>
                              </View>
                            )}
                            <View style={[styles.resolvedBadge, { backgroundColor: notif.status === 'approved' ? '#EEF2FF' : '#FDEDEC' }]}>
                              <Text style={[styles.resolvedText, { color: notif.status === 'approved' ? '#2C3E7A' : '#E74C3C' }]}>
                                {notif.status === 'approved' ? 'Request Approved' : 'Request Rejected'}
                              </Text>
                            </View>
                          </View>
                        )}
                      </TouchableOpacity>
                    </Swipeable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>

        {sidebarOpen && !isWeb && (
          <TouchableOpacity style={styles.overlay} onPress={() => setSidebarOpen(false)} />
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#F5F6FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F6FA' },
  content: { flex: 1, overflow: 'hidden', minWidth: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 10 },
  menuButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontWeight: 'bold', color: '#2C3E7A', flex: 1 },
  unreadBadge: { backgroundColor: '#E74C3C', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  unreadBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  markAllButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#2C3E7A' },
  markAllText: { color: '#2C3E7A', fontSize: 12, fontWeight: '600' },
  clearAllButton: { width: 36, height: 32, borderRadius: 6, borderWidth: 1, borderColor: '#E74C3C', justifyContent: 'center', alignItems: 'center', backgroundColor: '#FDEDEC' },
  notifList: { padding: 16, gap: 8 },
  notifCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, marginBottom: 8 },
  notifCardUnread: { borderLeftWidth: 3, borderLeftColor: '#2C3E7A', backgroundColor: '#F8F9FF' },
  notifCardRequest: { borderLeftWidth: 3, borderLeftColor: '#F39C12' },
  notifCardExpanded: { borderLeftWidth: 3, borderLeftColor: '#2C3E7A' },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  notifBody: { flex: 1, gap: 4 },
  notifMessage: { fontSize: 14, color: '#2D3436', lineHeight: 20 },
  notifTime: { fontSize: 12, color: '#999' },
  notifRight: { flexDirection: 'column', alignItems: 'center', gap: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2C3E7A' },
  expandedSection: { marginTop: 12, gap: 8 },
  expandedDivider: { height: 1, backgroundColor: '#F0F0F0', marginBottom: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13, color: '#555' },
  actionButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E74C3C', gap: 6 },
  rejectBtnText: { color: '#E74C3C', fontWeight: '600', fontSize: 13 },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: '#2C3E7A', gap: 6 },
  approveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  resolvedBadge: { padding: 10, borderRadius: 8, alignItems: 'center' },
  resolvedText: { fontSize: 13, fontWeight: '600' },
  swipeDeleteAction: { backgroundColor: '#E74C3C', justifyContent: 'center', alignItems: 'center', width: 100, marginBottom: 8, borderRadius: 12 },
  swipeDeleteText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 80, gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E7A' },
  emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
});
