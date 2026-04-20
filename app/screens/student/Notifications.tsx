import Sidebar from "@/components/Sidebar";
import { useUser } from "@/context/UserContext";
import { useResponsive } from "@/hooks/useResponsive";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
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
  View,
} from "react-native";
import {
  GestureHandlerRootView,
  Swipeable,
} from "react-native-gesture-handler";
import { db } from "../../../firebase";

const getNotifIcon = (type: string) => {
  switch (type) {
    case "session_started":
      return { name: "radio-outline", color: "#27AE60" };
    case "session_ended":
      return { name: "checkmark-done-circle", color: "#2C3E7A" };
    case "unenroll_approved":
      return { name: "checkmark-circle", color: "#27AE60" };
    case "unenroll_rejected":
      return { name: "close-circle", color: "#E74C3C" };
    case "delete_course_approved":
      return { name: "trash", color: "#E74C3C" };
    default:
      return { name: "notifications-outline", color: "#F39C12" };
  }
};

export default function StudentNotifications() {
  const { isWeb } = useResponsive();
  const { userData: studentData } = useUser();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  useEffect(() => {
    if (!studentData?.uid) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", studentData.uid),
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime - aTime;
        });
      setNotifications(list);
      setLoading(false);
      setRefreshing(false);
    });
    return unsubscribe;
  }, [studentData]);

  const markAsRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, "notifications", notifId), { read: true });
    } catch (err) {
      console.error(err);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => markAsRead(n.id)));
  };

  const deleteNotification = async (notifId: string) => {
    try {
      swipeableRefs.current.get(notifId)?.close();
      swipeableRefs.current.delete(notifId);
      await deleteDoc(doc(db, "notifications", notifId));
    } catch (err) {
      console.error(err);
    }
  };

  const clearResolved = async () => {
    const toDelete = notifications.filter((n) => n.read);
    if (toDelete.length === 0) {
      if (Platform.OS === "web")
        window.alert("No read notifications to clear.");
      else Alert.alert("Nothing to Clear", "No read notifications to clear.");
      return;
    }
    const doClear = async () => {
      setClearing(true);
      try {
        const batch = writeBatch(db);
        toDelete.forEach((n) => batch.delete(doc(db, "notifications", n.id)));
        await batch.commit();
      } catch (err) {
        console.error(err);
      } finally {
        setClearing(false);
      }
    };
    if (Platform.OS === "web") {
      if (
        window.confirm(
          `Clear ${toDelete.length} read notification${toDelete.length !== 1 ? "s" : ""}?`,
        )
      )
        doClear();
    } else {
      Alert.alert(
        "Clear Notifications",
        `Clear ${toDelete.length} read notification${toDelete.length !== 1 ? "s" : ""}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Clear", style: "destructive", onPress: doClear },
        ],
      );
    }
  };

  const onRefresh = () => setRefreshing(true);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
    notifId: string,
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: "clamp",
    });
    return (
      <TouchableOpacity
        style={styles.swipeDeleteAction}
        onPress={() => deleteNotification(notifId)}
        activeOpacity={0.8}
      >
        <Animated.View
          style={{ transform: [{ scale }], alignItems: "center", gap: 4 }}
        >
          <Ionicons name="trash-outline" size={24} color="#fff" />
          <Text style={styles.swipeDeleteText}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const readCount = notifications.filter((n) => n.read).length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2C3E7A" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        {(isWeb || sidebarOpen) && (
          <Sidebar
            role="student"
            userName={
              studentData
                ? `${studentData.firstName} ${studentData.lastName}`
                : "..."
            }
            activeRoute="/screens/student/Notifications"
          />
        )}

        <View style={styles.content}>
          <View
            style={[
              styles.topBar,
              { paddingTop: isWeb ? 28 : 50, minHeight: isWeb ? 64 : 80 },
            ]}
          >
            {!isWeb && !sidebarOpen && (
              <TouchableOpacity
                style={styles.menuButton}
                onPress={() => setSidebarOpen(true)}
              >
                <Ionicons name="menu" size={24} color="#2C3E7A" />
              </TouchableOpacity>
            )}
            <Text style={[styles.headerTitle, { fontSize: isWeb ? 18 : 15 }]}>
              Notifications
            </Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
            {unreadCount > 0 && (
              <TouchableOpacity
                style={styles.markAllButton}
                onPress={markAllRead}
              >
                <Text style={styles.markAllText}>Mark all read</Text>
              </TouchableOpacity>
            )}
            {readCount > 0 && (
              <TouchableOpacity
                style={styles.clearAllButton}
                onPress={clearResolved}
                disabled={clearing}
              >
                {clearing ? (
                  <ActivityIndicator size="small" color="#E74C3C" />
                ) : (
                  <Ionicons name="trash-outline" size={16} color="#E74C3C" />
                )}
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#2C3E7A"]}
                tintColor="#2C3E7A"
              />
            }
          >
            {notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="notifications-outline"
                  size={48}
                  color="#D0D0D0"
                />
                <Text style={styles.emptyTitle}>No Notifications</Text>
                <Text style={styles.emptySubtitle}>
                  You'll be notified about unenroll approvals, session updates
                  and more
                </Text>
              </View>
            ) : (
              <View style={styles.notifList}>
                {notifications.map((notif) => {
                  const icon = getNotifIcon(notif.type);
                  return (
                    <Swipeable
                      key={notif.id}
                      ref={(ref) => {
                        if (ref) swipeableRefs.current.set(notif.id, ref);
                      }}
                      renderRightActions={(progress, dragX) =>
                        renderRightActions(progress, dragX, notif.id)
                      }
                      rightThreshold={40}
                      friction={2}
                      overshootRight={false}
                    >
                      <TouchableOpacity
                        style={[
                          styles.notifCard,
                          !notif.read && styles.notifCardUnread,
                        ]}
                        onPress={() => markAsRead(notif.id)}
                        activeOpacity={0.8}
                      >
                        <View
                          style={[
                            styles.iconContainer,
                            { backgroundColor: icon.color + "20" },
                          ]}
                        >
                          <Ionicons
                            name={icon.name as any}
                            size={22}
                            color={icon.color}
                          />
                        </View>
                        <View style={styles.notifBody}>
                          <Text style={styles.notifMessage}>
                            {notif.message}
                          </Text>
                          <Text style={styles.notifTime}>
                            {formatDate(notif.createdAt)}
                          </Text>
                        </View>
                        {!notif.read && <View style={styles.unreadDot} />}
                      </TouchableOpacity>
                    </Swipeable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>

        {sidebarOpen && !isWeb && (
          <TouchableOpacity
            style={styles.overlay}
            onPress={() => setSidebarOpen(false)}
          />
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row", backgroundColor: "#F5F6FA" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F6FA",
  },
  content: { flex: 1, overflow: "hidden", minWidth: 0 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 24,
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    gap: 10,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#F5F6FA",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontWeight: "bold", color: "#2C3E7A", flex: 1 },
  unreadBadge: {
    backgroundColor: "#E74C3C",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unreadBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  markAllButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2C3E7A",
  },
  markAllText: { color: "#2C3E7A", fontSize: 12, fontWeight: "600" },
  clearAllButton: {
    width: 36,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E74C3C",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FDEDEC",
  },
  notifList: { padding: 16, gap: 10 },
  notifCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 8,
  },
  notifCardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: "#2C3E7A",
    backgroundColor: "#F8F9FF",
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  notifBody: { flex: 1, gap: 4 },
  notifMessage: { fontSize: 14, color: "#2D3436", lineHeight: 20 },
  notifTime: { fontSize: 12, color: "#999" },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2C3E7A",
  },
  swipeDeleteAction: {
    backgroundColor: "#E74C3C",
    justifyContent: "center",
    alignItems: "center",
    width: 100,
    marginBottom: 8,
    borderRadius: 12,
  },
  swipeDeleteText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  emptyState: {
    alignItems: "center",
    paddingVertical: 80,
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: "#2C3E7A" },
  emptySubtitle: { fontSize: 14, color: "#666", textAlign: "center" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 10,
  },
});
